// cart.page.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { CartService } from '../shared/services/cart.service';
import { AlertController, ToastController } from '@ionic/angular';
import { Router } from '@angular/router';
import { Product } from '../shared/models/product';
import { Subscription, take } from 'rxjs';


interface CartItem {
  product_id: string;
  name: string;
  price: number;
  image: string;
  quantity: number;
}

@Component({
  selector: 'app-cart',
  templateUrl: './cart.page.html',
  styleUrls: ['./cart.page.scss'],
  standalone: false,
})
export class CartPage implements OnInit, OnDestroy {
  cartItems: CartItem[] = [];
  isLoading = true;
  private cartSubscription: Subscription | null = null;

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
    private router: Router
  ) { }

  ngOnInit() {
    this.loadCartItems();
  }

  ngOnDestroy() {
    if (this.cartSubscription) {
      this.cartSubscription.unsubscribe();
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
          image: 'assets/placeholder.jpg', // Placeholder - replace with actual data
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
  
    // Check if user is logged in
    this.cartService.isLoggedIn().pipe(take(1)).subscribe(isLoggedIn => {
      if (!isLoggedIn) {
        this.presentAuthAlert();
      } else {
        this.processCheckout();
      }
    });
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

  async processCheckout() {
    // Show loading indicator
    const loading = await this.alertController.create({
      message: 'Processing your order...',
      backdropDismiss: false
    });
    await loading.present();
  
    try {
      // Send the full item details to the checkout method
      const result = await this.cartService.checkout(this.cartItems);
      
      await loading.dismiss();
      
      // Show success message
      const alert = await this.alertController.create({
        header: 'Order Placed!',
        message: 'Your order has been successfully placed.',
        buttons: [{
          text: 'OK',
          handler: () => {
            // Navigate to order confirmation or home page
            this.router.navigate(['/order-confirmation'], { 
              queryParams: { orderId: result.sale_id } 
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