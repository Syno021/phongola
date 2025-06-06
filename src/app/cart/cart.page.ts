// cart.page.ts
import { Component, OnInit, OnDestroy, Injector, NgZone, runInInjectionContext} from '@angular/core';
import { CartService } from '../shared/services/cart.service';
import { AlertController, ToastController, LoadingController } from '@ionic/angular';
import { Router } from '@angular/router';
import { Product } from '../shared/models/product';
import { Subscription, take } from 'rxjs';
import { environment } from '../../environments/environment';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { CustomerAddress } from '../shared/models/customerAddress';

declare global {
  interface Window {
    PaystackPop: any;
  }
}

interface CartItem {
  product_id: string;
  name: string;
  price: number;
  image_url: string;
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
  userId: string = '';
  
  // Delivery option variables
  deliveryMethod: 'online' | 'delivery' = 'online';
  deliveryFee: number = 50; // Default delivery fee
  savedAddresses: CustomerAddress[] = [];
  selectedAddressId: string | null = null;
  showNewAddressForm: boolean = false;
  addressForm: FormGroup;

  get subtotal(): number {
    return this.cartItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  }

  get tax(): number {
    return this.subtotal * 0.15;
  }

  get total(): number {
    return this.subtotal + this.tax + (this.deliveryMethod === 'delivery' ? this.deliveryFee : 0);
  }

  get formattedSubtotal(): string {
    return this.formatCurrency(this.subtotal);
  }

  get formattedTax(): string {
    return this.formatCurrency(this.tax);
  }
  
  get formattedDeliveryFee(): string {
    return this.formatCurrency(this.deliveryFee);
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
    private injector: Injector,
    private formBuilder: FormBuilder
  ) {
    this.addressForm = this.formBuilder.group({
      address_line1: ['', Validators.required],
      address_line2: [''],
      city: ['', Validators.required],
      state: ['', Validators.required],
      postal_code: ['', Validators.required],
      country: ['', Validators.required],
      is_default: [false]
    });
  }

  ngOnInit() {
    this.loadCartItems();
    this.loadPaystackScript();
    this.getCurrentUserInfo();
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

  async getCurrentUserInfo() {
    try {
      const user = await this.cartService.getCurrentUser();
      if (user) {
        this.userEmail = user.email || 'customer@email.com';
        this.userId = user.uid;
        
        // Load user's saved addresses
        this.loadSavedAddresses();
      }
    } catch (error) {
      console.error('Error getting current user:', error);
    }
  }
  
  async loadSavedAddresses() {
    if (!this.userId) return;
    
    try {
      const addressesSnapshot = await this.ngZone.run(() => {
        return runInInjectionContext(this.injector, async () => {
          return this.firestore
            .collection<CustomerAddress>('customer_addresses', ref => 
              ref.where('user_id', '==', this.userId))
            .get()
            .toPromise();
        });
      });
      
      if (addressesSnapshot) {
        this.savedAddresses = addressesSnapshot.docs.map(doc => {
          const data = doc.data() as CustomerAddress;
          return { ...data, address_id: doc.id };
        });
        
        // Set default address if available
        const defaultAddress = this.savedAddresses.find(addr => addr.is_default);
        if (defaultAddress) {
          this.selectedAddressId = defaultAddress.address_id;
        } else if (this.savedAddresses.length > 0) {
          this.selectedAddressId = this.savedAddresses[0].address_id;
        }
      }
    } catch (error) {
      console.error('Error loading saved addresses:', error);
      await this.presentToast('Unable to load your delivery addresses. Please try refreshing the page.');
    }
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
        await this.openLoginComponent();
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
    // Get the delivery address if delivery method is selected
    let deliveryAddress = null;
    if (this.deliveryMethod === 'delivery') {
      if (this.selectedAddressId && !this.showNewAddressForm) {
        // Use selected saved address
        deliveryAddress = this.savedAddresses.find(addr => addr.address_id === this.selectedAddressId);
      } else {
        // Use new address from form
        deliveryAddress = this.addressForm.value;
        
        // Save the new address to Firestore if form is valid
        if (this.addressForm.valid) {
          await this.saveNewAddress();
        }
      }
    }
    
    // Generate a unique order ID
    const orderId = `ORD_${new Date().getTime()}_${Math.floor(Math.random() * 1000)}`;
    
    // Create the main order record with all details
    const orderData = {
      order_id: orderId,
      amount: this.total,
      user_email: this.userEmail,
      user_id: this.userId,
      status: 'processing',
      payment_status: 'paid',
      payment_reference: reference,
      created_at: new Date(),
      delivery_method: this.deliveryMethod,
      delivery_address: deliveryAddress,
      delivery_fee: this.deliveryMethod === 'delivery' ? this.deliveryFee : 0,
      items: this.cartItems.map(item => ({
        product_id: item.product_id,
        name: item.name,
        price: item.price,
        quantity: item.quantity
      }))
    };

    // Save the order to Firestore
    await this.ngZone.run(() => {
      return runInInjectionContext(this.injector, async () => {
        return this.firestore.collection('orders').doc(orderId).set(orderData);
      });
    });
    
    // Also save minimal payment record with reference to the order
    await this.ngZone.run(() => {
      return runInInjectionContext(this.injector, async () => {
        return this.firestore.collection('payments').doc(reference).set({
          order_id: orderId,
          amount: this.total,
          status: 'successful',
          created_at: new Date(),
          payment_method: 'paystack',
          user_id: this.userId
        });
      });
    });
    
    // *** ADD THIS LINE - Update product quantities ***
    await this.updateProductQuantities(this.cartItems);
    
    // Clear the cart
    this.cartService.clearCart();
    
    loading.dismiss();
    
    // Show success message and navigate to confirmation page
    const alert = await this.alertController.create({
      header: 'Order Placed!',
      message: 'Your payment was successful and your order has been placed.',
      buttons: [{
        text: 'OK',
        handler: () => {
          this.router.navigate(['/order-confirmation'], {
            queryParams: {
              orderId: orderId,
              paymentRef: reference,
              deliveryMethod: this.deliveryMethod
            }
          });
        }
      }]
    });
    await alert.present();
    
  } catch (error) {
    loading.dismiss();
    console.error('Error saving payment:', error);
    this.presentToast('Payment verification failed. Please contact support.');
  }
}

  private async updateProductQuantities(items: CartItem[]) {
  try {
    await this.ngZone.run(() => {
      return runInInjectionContext(this.injector, async () => {
        const batch = this.firestore.firestore.batch();
        
        for (const item of items) {
          const productRef = await this.ngZone.run(() => {
            return runInInjectionContext(this.injector, async () => {
              return this.firestore.doc(`products/${item.product_id}`).ref;
            });
          });
          
          // Get current product data
          const productDoc = await productRef.get();
          if (productDoc.exists) {
            const currentStock = (productDoc.data() as { stock_quantity?: number })?.stock_quantity || 0;
            const newStock = Math.max(0, currentStock - item.quantity);
            
            // Update the stock quantity
            batch.update(productRef, { stock_quantity: newStock });
          }
        }
        
        // Commit all updates
        await batch.commit();
      });
    });
    console.log('Product quantities updated successfully');
  } catch (error) {
    console.error('Error updating product quantities:', error);
    throw error;
  }
}

  private async loadCartItems() {
    this.isLoading = true;
    this.cartSubscription = this.cartService.cartItems$.subscribe(async cartMap => {
      // Get complete product details for each item in cart
      const productPromises = Array.from(cartMap.entries()).map(async ([productId, quantity]) => {
        const productDoc = await this.ngZone.run(() => {
          return runInInjectionContext(this.injector, async () => {
            return this.firestore.doc(`products/${productId}`).get().toPromise();
          });
        });
        const productData = productDoc?.data() as Product;
        return {
          product_id: productId,
          name: productData?.name || 'Unknown Product',
          price: productData?.price || 0,
          image_url: productData?.image_url || 'assets/placeholder.jpg',
          quantity: quantity
        } as CartItem;
      });

      this.cartItems = await Promise.all(productPromises);
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
    this.presentToast(`"${item.name}" has been removed from your cart`);
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
            this.presentToast('Your cart has been cleared');
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
      this.presentToast('Please add items to your cart before checking out');
      return;
    }
    
    // Check if delivery method and address are valid if delivery is selected
    if (this.deliveryMethod === 'delivery') {
      if (!this.isValidDeliverySelection()) {
        this.presentToast('Please provide a delivery address to continue');
        return;
      }
      
      // If using new address form, validate it
      if (this.showNewAddressForm && !this.addressForm.valid) {
        this.markFormGroupTouched(this.addressForm);
        this.presentToast('Please complete all required address fields');
        return;
      }
      
      // Process the order with delivery
      this.processDeliveryOrder();
    } else {
      // Start the online payment process
      this.makePayment();
    }
  }
  
  // Helper method to mark all form controls as touched
  markFormGroupTouched(formGroup: FormGroup) {
    Object.values(formGroup.controls).forEach(control => {
      control.markAsTouched();
      if (control instanceof FormGroup) {
        this.markFormGroupTouched(control);
      }
    });
  }
  
  // Check if delivery selection is valid
  isValidDeliverySelection(): boolean {
    if (this.showNewAddressForm) {
      return this.addressForm.valid;
    } else {
      return !!this.selectedAddressId;
    }
  }
  
  // Process order with delivery
  async processDeliveryOrder() {
  const loading = await this.loadingController.create({
    message: 'Processing your order...',
    spinner: 'circles'
  });
  await loading.present();
  
  try {
    // Generate a unique order ID
    const orderId = `ORD_${new Date().getTime()}_${Math.floor(Math.random() * 1000)}`;
    
    // Get the delivery address
    let deliveryAddress = null;
    if (this.selectedAddressId && !this.showNewAddressForm) {
      deliveryAddress = this.savedAddresses.find(addr => addr.address_id === this.selectedAddressId);
    } else {
      deliveryAddress = this.addressForm.value;
      await this.saveNewAddress();
    }

    // Initialize Paystack payment
    const amountInCents = Math.round(this.total * 100);
    const handler = window.PaystackPop.setup({
      key: environment.paystackTestPublicKey,
      email: this.userEmail,
      amount: amountInCents,
      currency: 'ZAR',
      ref: orderId, // Use orderId as payment reference for consistency
      onClose: () => {
        console.log('Payment window closed');
        loading.dismiss();
      },
      callback: async (response: any) => {
        try {
          // Save comprehensive order details to Firestore
          const orderData = {
            order_id: orderId,
            amount: this.total,
            user_email: this.userEmail,
            user_id: this.userId,
            status: 'processing',
            payment_status: 'paid',
            payment_reference: response.reference,
            created_at: new Date(),
            delivery_method: this.deliveryMethod,
            delivery_address: deliveryAddress,
            delivery_fee: this.deliveryFee,
            items: this.cartItems.map(item => ({
              product_id: item.product_id,
              name: item.name,
              price: item.price,
              quantity: item.quantity
            }))
          };
          
          // Save the order to Firestore
          await this.ngZone.run(() => {
            return runInInjectionContext(this.injector, async () => {
              await this.firestore.collection('orders').doc(orderId).set(orderData);
            });
          });

          // Also save minimal payment record with reference to the order
          await this.ngZone.run(() => {
            return runInInjectionContext(this.injector, async () => {
              await this.firestore.collection('payments').doc(response.reference).set({
                order_id: orderId,
                amount: this.total,
                status: 'successful',
                created_at: new Date(),
                payment_method: 'paystack',
                user_id: this.userId
              });
            });
          });
          
          // *** ADD THIS LINE - Update product quantities ***
          await this.updateProductQuantities(this.cartItems);
          
          // Clear the cart
          this.cartService.clearCart();
          
          loading.dismiss();
          
          // Show success message
          const alert = await this.alertController.create({
            header: 'Order Placed!',
            message: 'Your payment was successful and your order will be delivered to your address.',
            buttons: [{
              text: 'OK',
              handler: () => {
                this.router.navigate(['/order-confirmation'], {
                  queryParams: {
                    orderId: orderId,
                    paymentRef: response.reference,
                    deliveryMethod: this.deliveryMethod
                  }
                });
              }
            }]
          });
          await alert.present();
        } catch (error) {
          console.error('Error processing order:', error);
          loading.dismiss();
          this.presentToast('Error processing your order. Please try again.');
        }
      },
      onError: async (error: any) => {
        console.error('Payment error:', error);
        loading.dismiss();
        await this.presentToast(`Payment error: ${error.message || 'Unknown error occurred'}`);
      }
    });

    handler.openIframe();
  } catch (error) {
    loading.dismiss();
    console.error('Error initializing payment:', error);
    this.presentToast('Failed to initialize payment. Please try again.');
  }
}

  async saveNewAddress() {
    if (!this.addressForm.valid || !this.userId) return;
    
    const newAddress: CustomerAddress = {
      ...this.addressForm.value,
      user_id: this.userId,
      address_id: null // Will be set by Firestore
    };
    
    try {
      // Check if this is set as default and we need to update other addresses
      if (newAddress.is_default) {
        // Find all existing default addresses and update them
        const defaultAddressesSnapshot = await this.ngZone.run(() => {
          return runInInjectionContext(this.injector, async () => {
            return this.firestore
              .collection<CustomerAddress>('customer_addresses', ref => 
                ref.where('user_id', '==', this.userId)
                  .where('is_default', '==', true))
              .get()
              .toPromise();
          });
        });
        
        if (defaultAddressesSnapshot) {
          const batch = this.firestore.firestore.batch();
          defaultAddressesSnapshot.docs.forEach(doc => {
            batch.update(doc.ref, { is_default: false });
          });
          await batch.commit();
        }
      }
      
      // Add the new address
      const docRef = await this.ngZone.run(() => {
        return runInInjectionContext(this.injector, async () => {
          return this.firestore.collection('customer_addresses').add(newAddress);
        });
      });
      
      // Update local saved addresses list
      newAddress.address_id = docRef.id;
      this.savedAddresses = [...this.savedAddresses, newAddress];
      this.selectedAddressId = docRef.id;
      
      // Reset form and hide it
      this.addressForm.reset();
      this.showNewAddressForm = false;
      
    } catch (error) {
      console.error('Error saving new address:', error);
      await this.presentToast('We couldn\'t save your address. Please check your information and try again.');
      throw error; // Rethrow to handle in the calling function
    }
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
            this.router.navigate(['/home'], { 
              queryParams: { returnUrl: '/cart' } 
            });
          }
        }
      ]
    });
    await alert.present();
  }

  async processCheckout(reference: string) {
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
        payment_reference: reference,
        delivery_method: this.deliveryMethod
      }));
      
      // Send the full item details to the checkout method
      const result = await this.cartService.checkout(cartItemsWithPayment);
      
      await loading.dismiss();
      
      // Show success message
      const alert = await this.alertController.create({
        header: 'Order Placed!',
        message: this.deliveryMethod === 'online' 
          ? 'Your payment was successful and your order has been placed.'
          : 'Your order has been placed and will be delivered to your address. Payment will be collected upon delivery.',
        buttons: [{
          text: 'OK',
          handler: () => {
            // Navigate to order confirmation or home page
            this.router.navigate(['/order-confirmation'], { 
              queryParams: { 
                orderId: result.sale_id,
                paymentRef: reference,
                deliveryMethod: this.deliveryMethod
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
  
// Toggle between showing new address form and saved addresses
toggleNewAddressForm() {
  this.showNewAddressForm = !this.showNewAddressForm;
  if (this.showNewAddressForm) {
    this.addressForm.reset({
      address_line1: '',
      address_line2: '',
      city: '',
      state: '',
      postal_code: '',
      country: '',
      is_default: false
    });
  } else {
    // If hiding form, ensure we have a selected address if available
    if (this.savedAddresses.length > 0 && !this.selectedAddressId) {
      this.selectedAddressId = this.savedAddresses[0].address_id;
    }
  }
}

// Handle delivery method change
deliveryMethodChanged() {
  // If switching to delivery, load addresses if not done yet
  if (this.deliveryMethod === 'delivery' && this.userId && this.savedAddresses.length === 0) {
    this.loadSavedAddresses();
  }
  
  // If switching to online payment, reset address form visibility
  if (this.deliveryMethod === 'online') {
    this.showNewAddressForm = false;
  }
}

// Delete a saved address
async deleteAddress(addressId: string) {
  const alert = await this.alertController.create({
    header: 'Delete Address',
    message: 'Are you sure you want to delete this address?',
    buttons: [
      {
        text: 'Cancel',
        role: 'cancel'
      },
      {
        text: 'Delete',
        role: 'destructive',
        handler: async () => {
          try {
            await this.ngZone.run(() => {
              return runInInjectionContext(this.injector, async () => {
                return this.firestore.doc(`customer_addresses/${addressId}`).delete();
              });
            });
            
            // Update local saved addresses list
            this.savedAddresses = this.savedAddresses.filter(addr => addr.address_id !== addressId);
            
            // If the deleted address was selected, select another one
            if (this.selectedAddressId === addressId) {
              this.selectedAddressId = this.savedAddresses.length > 0 ? this.savedAddresses[0].address_id : null;
            }
            
            await this.presentToast('Your delivery address has been removed');
          } catch (error) {
            console.error('Error deleting address:', error);
            await this.presentToast('We couldn\'t delete this address. Please try again.');
          }
        }
      }
    ]
  });
  await alert.present();
}

// Edit a saved address
editAddress(address: CustomerAddress) {
  this.showNewAddressForm = true;
  this.addressForm.setValue({
    address_line1: address.address_line1,
    address_line2: address.address_line2 || '',
    city: address.city,
    state: address.state,
    postal_code: address.postal_code,
    country: address.country,
    is_default: address.is_default
  });
  
  // Store the editing address ID
  this.addressForm.addControl('address_id', this.formBuilder.control(address.address_id));
  
  // Scroll to the form
  setTimeout(() => {
    const formElement = document.querySelector('.address-form');
    if (formElement) {
      formElement.scrollIntoView({ behavior: 'smooth' });
    }
  }, 100);
}

// Save edited address
async saveEditedAddress() {
  if (!this.addressForm.valid) {
    this.markFormGroupTouched(this.addressForm);
    this.presentToast('Please fill in all required address fields');
    return;
  }
  
  const formValues = this.addressForm.value;
  const addressId = formValues.address_id;
  
  // Create the updated address object
  const updatedAddress = {
    address_line1: formValues.address_line1,
    address_line2: formValues.address_line2,
    city: formValues.city,
    state: formValues.state,
    postal_code: formValues.postal_code,
    country: formValues.country,
    is_default: formValues.is_default
  };
  
  try {
    if (formValues.is_default) {
      const defaultAddressesSnapshot = await this.ngZone.run(() => {
        return runInInjectionContext(this.injector, async () => {
          return this.firestore
            .collection<CustomerAddress>('customer_addresses')
            .ref.where('user_id', '==', this.userId)
            .where('is_default', '==', true)
            .where('address_id', '!=', addressId)
            .get();
        });
      });
      
      if (defaultAddressesSnapshot) {
        await this.ngZone.run(() => {
          return runInInjectionContext(this.injector, async () => {
            const batch = this.firestore.firestore.batch();
            defaultAddressesSnapshot.docs.forEach(doc => {
              batch.update(doc.ref, { is_default: false });
            });
            await batch.commit();
          });
        });
      }
    }
    
    // Update the address
    await this.ngZone.run(() => {
      return runInInjectionContext(this.injector, async () => {
        return this.firestore.doc(`customer_addresses/${addressId}`).update(updatedAddress);
      });
    });
    
    // Update local saved addresses list
    this.savedAddresses = this.savedAddresses.map(addr => 
      addr.address_id === addressId ? {...addr, ...updatedAddress} : addr
    );
    
    // Reset form and hide it
    this.addressForm.removeControl('address_id');
    this.addressForm.reset();
    this.showNewAddressForm = false;
    this.selectedAddressId = addressId;
    
    await this.presentToast('Address updated successfully');
  } catch (error) {
    console.error('Error updating address:', error);
    await this.presentToast('Failed to update address. Please try again.');
  }
}

// Helper method to check if there's an ID in the form (for edit mode)
isEditingAddress(): boolean {
  return this.addressForm.get('address_id') !== null;
}

// Submit the address form (for add or edit)
async submitAddressForm() {
  if (!this.userId) {
    this.presentToast('Please sign in to save your delivery address');
    await this.openLoginComponent();
    return;
  }

  if (!this.addressForm.valid) {
    this.markFormGroupTouched(this.addressForm);
    this.presentToast('Please fill in all required address fields to continue');
    return;
  }

  try {
    const formData = this.addressForm.value;
    
    if (this.isEditingAddress()) {
      await this.saveEditedAddress();
    } else {
      // Create new address document
      const newAddress: CustomerAddress = {
        ...formData,
        user_id: this.userId,
        created_at: new Date(),
        address_id: null
      };

      // If this is set as default, update other addresses first
      if (newAddress.is_default) {
        const batch = this.firestore.firestore.batch();
        const defaultAddresses = await this.ngZone.run(() => {
          return runInInjectionContext(this.injector, async () => {
            return this.firestore
              .collection<CustomerAddress>('customer_addresses')
              .ref.where('user_id', '==', this.userId)
              .where('is_default', '==', true)
              .get();
          });
        });

        defaultAddresses.docs.forEach(doc => {
          batch.update(doc.ref, { is_default: false });
        });
        await batch.commit();
      }

      // Add the new address with ngZone and runInInjectionContext
      const docRef = await this.ngZone.run(() => {
        return runInInjectionContext(this.injector, async () => {
          return this.firestore.collection('customer_addresses').add(newAddress);
        });
      });

      // Update local state
      newAddress.address_id = docRef.id;
      this.savedAddresses = [...this.savedAddresses, newAddress];
      this.selectedAddressId = docRef.id;
      
      // Reset form and hide it
      this.addressForm.reset();
      this.showNewAddressForm = false;
      
      await this.presentToast('Your delivery address has been saved');
    }
  } catch (error) {
    console.error('Error saving address:', error);
    await this.presentToast('We couldn\'t save your address. Please check your information and try again.');
  }
}

private async openLoginComponent() {
  const alert = await this.alertController.create({
    header: 'Login Required',
    message: 'Please log in to continue with your payment',
    buttons: [
      {
        text: 'Cancel',
        role: 'cancel'
      },
      {
        text: 'Login',
        handler: () => {
          // Navigate to login with return URL
          this.router.navigate(['/home'], {
            queryParams: {
              returnUrl: '/cart',
              action: 'payment'
            }
          });
        }
      }
    ]
  });
  await alert.present();
}
}