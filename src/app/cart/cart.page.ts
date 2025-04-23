// cart.page.ts
import { Component, OnInit, OnDestroy, Injector, NgZone, runInInjectionContext} from '@angular/core';
import { CartService } from '../shared/services/cart.service';
import { AlertController, ToastController, LoadingController } from '@ionic/angular';
import { Router } from '@angular/router';
import { Product } from '../shared/models/product';
import { Subscription, take } from 'rxjs';
import { environment } from '../../environments/environment';
import { AngularFirestore } from '@angular/fire/compat/firestore';

declare global {
  interface Window {
    PaystackPop: any;
  }
}

interface CartItem {
  product_id: string;
  name: string;
  price: number;
  imageurl: string;
  quantity: number;
}

@Component({
  selector: 'app-cart',
  templateUrl: './cart.page.html',
  styleUrls: ['./cart.page.scss'],
  standalone: false,
})
export class CartPage implements OnInit, OnDestroy {
  private paystackScriptLoaded: boolean = false;
  cartItems: CartItem[] = [];
  isLoading = true;
  private cartSubscription: Subscription | null = null;
  userEmail: string = '';

  get subtotal(): number {
    return this.cartItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  }

  get tax(): number {
    return this.subtotal * 0.15;
  }

  get total(): number {
    return this.subtotal + this.tax;
  }

  get formattedSubtotal(): string {
    return this.formatCurrency(this.subtotal);
  }

  get formattedTax(): string {
    return this.formatCurrency(this.tax);
  }

  get formattedTotal(): string {
    return this.formatCurrency(this.total);
  }

  constructor(
    private cartService: CartService,
    private alertController: AlertController,
    private toastController: ToastController,
    private loadingController: LoadingController,
    private router: Router,
    private firestore: AngularFirestore,
    private ngZone: NgZone,
    private injector: Injector
  ) { }

  ngOnInit() {
    this.loadCartItems();
    this.loadPaystackScript();
    this.getCurrentUserEmail();
  }

  ngOnDestroy() {
    if (this.cartSubscription) {
      this.cartSubscription.unsubscribe();
    }
  }

  loadPaystackScript() {
    if (!this.paystackScriptLoaded) {
      const script = document.createElement('script');
      script.src = 'https://js.paystack.co/v1/inline.js';
      script.async = true;
      script.onload = () => {
        this.paystackScriptLoaded = true;
        console.log('Paystack script loaded');
      };
      document.body.appendChild(script);
    }
  }

  getCurrentUserEmail() {
    this.cartService.getCurrentUser().then(user => {
      if (user) {
        this.userEmail = user.email || 'customer@email.com';
      }
    });
  }

  async makePayment() {
    if (!this.paystackScriptLoaded) {
      await this.presentToast('Paystack script not loaded yet. Please try again.');
      return;
    }

    if (typeof window.PaystackPop === 'undefined') {
      await this.presentToast('PaystackPop is not defined. Please refresh the page and try again.');
      return;
    }

    // Check if user is logged in before proceeding
    this.cartService.isLoggedIn().pipe(take(1)).subscribe(async isLoggedIn => {
      if (!isLoggedIn) {
        this.presentAuthAlert();
        return;
      }

      // Generate a unique reference
      const paymentReference = `PAY_${new Date().getTime()}_${Math.floor(Math.random() * 1000)}`;
      
      // Use the actual total amount from the cart
      const amountInCents = Math.round(this.total * 100);

      const handler = window.PaystackPop.setup({
        key: environment.paystackTestPublicKey,
        email: this.userEmail,
        amount: amountInCents, // Amount in cents
        currency: 'ZAR', // South African Rand
        ref: paymentReference,
        onClose: () => {
          console.log('Payment window closed');
        },
        callback: (response: any) => {
          console.log('Payment successful', response);
          this.verifyTransaction(response.reference);
        },
        onError: async (error: any) => {
          console.error('Payment error:', error);
          await this.presentToast(`Payment error: ${error.message || 'Unknown error occurred'}`);
        }
      });

      handler.openIframe();
    });
  }

  async verifyTransaction(reference: string) {
    const loading = await this.loadingController.create({
      message: 'Verifying your payment...',
      spinner: 'circles'
    });
    await loading.present();

    try {
      // Save payment details to Firestore
      const paymentData = {
        reference: reference,
        amount: this.total,
        user_email: this.userEmail,
        status: 'successful',
        created_at: new Date(),
        items: this.cartItems.map(item => ({
          product_id: item.product_id,
          name: item.name,
          price: item.price,
          quantity: item.quantity
        }))
      };

      // Save payment data to Firestore
      await this.ngZone.run(() => {
        return runInInjectionContext(this.injector, async () => {
            return this.firestore.collection('payments').doc(reference).set(paymentData);
        });
      });
      
      // Now process the checkout with CartService
      await this.processCheckout(reference);
      
      loading.dismiss();
    } catch (error) {
      loading.dismiss();
      console.error('Error saving payment:', error);
      this.presentToast('Payment verification failed. Please contact support.');
    }
  }

  private loadCartItems() {
    this.isLoading = true;
    // Subscribe to cart updates
    this.cartSubscription = this.cartService.cartItems$.subscribe(cartMap => {
      // Convert the cart map to an array of cart items
      // In a real implementation, you would likely need to fetch product details from a service
      // For now, we'll simulate with the data we have
      this.cartItems = Array.from(cartMap.entries()).map(([productId, quantity]) => {
        // In a real app, you would fetch these details from a product service
        // For demo purposes, we'll create placeholder data
        return {
          product_id: productId,
          name: `Product ${productId.substring(0, 5)}...`, // Placeholder - replace with actual data
          price: 99.99, // Placeholder - replace with actual data
          imageurl: 'assets/placeholder.jpg', // Placeholder - replace with actual data
          quantity: quantity
        } as CartItem;
      });
      this.isLoading = false;
    });
  }

  updateQuantity(item: CartItem, change: number) {
    const newQuantity = item.quantity + change;
    if (newQuantity > 0) {
      this.cartService.updateQuantity(item.product_id, newQuantity);
    } else {
      this.confirmRemoveItem(item);
    }
  }

  async confirmRemoveItem(item: CartItem) {
    const alert = await this.alertController.create({
      header: 'Remove Item',
      message: `Are you sure you want to remove ${item.name} from your cart?`,
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel'
        },
        {
          text: 'Remove',
          role: 'destructive',
          handler: () => {
            this.removeItem(item);
          }
        }
      ]
    });
    await alert.present();
  }

  removeItem(item: CartItem) {
    this.cartService.removeFromCart(item.product_id);
    this.presentToast(`${item.name} removed from cart`);
  }

  async clearCart() {
    const alert = await this.alertController.create({
      header: 'Clear Cart',
      message: 'Are you sure you want to remove all items from your cart?',
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel'
        },
        {
          text: 'Clear All',
          role: 'destructive',
          handler: () => {
            this.cartService.clearCart();
            this.presentToast('Cart cleared');
          }
        }
      ]
    });
    await alert.present();
  }

  async presentToast(message: string) {
    const toast = await this.toastController.create({
      message: message,
      duration: 2000,
      position: 'bottom'
    });
    toast.present();
  }

  proceedToCheckout() {
    if (this.cartItems.length === 0) {
      this.presentToast('Your cart is empty');
      return;
    }
  
    // Start the payment process
    this.makePayment();
  }

  async presentAuthAlert() {
    const alert = await this.alertController.create({
      header: 'Login Required',
      message: 'You need to be logged in to complete your purchase.',
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel'
        },
        {
          text: 'Login',
          handler: () => {
            this.router.navigate(['/login'], { 
              queryParams: { returnUrl: '/cart' } 
            });
          }
        }
      ]
    });
    await alert.present();
  }

  async processCheckout(paymentReference: string) {
    // Show loading indicator
    const loading = await this.loadingController.create({
      message: 'Processing your order...',
      spinner: 'circles'
    });
    await loading.present();
  
    try {
      // Add payment reference to the cart items
      const cartItemsWithPayment = this.cartItems.map(item => ({
        ...item,
        payment_reference: paymentReference
      }));
      
      // Send the full item details to the checkout method
      const result = await this.cartService.checkout(cartItemsWithPayment);
      
      await loading.dismiss();
      
      // Show success message
      const alert = await this.alertController.create({
        header: 'Order Placed!',
        message: 'Your payment was successful and your order has been placed.',
        buttons: [{
          text: 'OK',
          handler: () => {
            // Navigate to order confirmation or home page
            this.router.navigate(['/order-confirmation'], { 
              queryParams: { 
                orderId: result.sale_id,
                paymentRef: paymentReference
              } 
            });
          }
        }]
      });
      await alert.present();
      
    } catch (error) {
      await loading.dismiss();
      
      // Show error message
      const alert = await this.alertController.create({
        header: 'Error',
        message: error instanceof Error ? error.message : 'An unknown error occurred',
        buttons: ['OK']
      });
      await alert.present();
    }
  }

  continueShopping() {
    this.router.navigate(['/']);
  }

  formatCurrency(value: number): string {
    return 'R' + value.toFixed(2);
  }

  getItemTotal(item: CartItem): string {
    return this.formatCurrency(item.price * item.quantity);
  }
}