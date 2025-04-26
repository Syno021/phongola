// HomePage Component - Updated implementation
import { Component, OnInit, Injector, NgZone, OnDestroy } from '@angular/core';
import { Product, ProductCategory } from '../shared/models/product';
import { Promotion } from '../shared/models/promotion';
import { AngularFireAuth } from '@angular/fire/compat/auth';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { Router } from '@angular/router';
import { AlertController, LoadingController, ToastController } from '@ionic/angular';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { runInInjectionContext } from '@angular/core';
import { ModalController } from '@ionic/angular';
import { LoginComponent } from '../login/login.component';
import { CartService } from '../shared/services/cart.service';
import { Observable, Subscription, firstValueFrom as rxjsFirstValueFrom } from 'rxjs';
import * as bcrypt from 'bcryptjs';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';



interface CartItem {
  product_id: string;
  name: string;
  price: number;
  image_url: string;
  quantity: number;
}

@Component({
  selector: 'app-pos',
  templateUrl: './pos.page.html',
  styleUrls: ['./pos.page.scss'],
  standalone: false,
})
export class PosPage implements OnInit {
    // Add these properties
    paymentMethod: 'cash' | 'card' | null = null;
    cashAmount: string = '';
    
    cartItems: CartItem[] = [];
    isLoading = true;
    private cartSubscription: Subscription | null = null;
    userEmail: string = '';
  products: Product[] = [];
  promotions: Promotion[] = [];
  loading: boolean = true;
  cartItemCount = 0;
  selectedCategory: ProductCategory | null = null;
  categories = Object.values(ProductCategory);
  // Temporary buffer for items being modified in the UI before adding to cart
  tempQuantities = new Map<string, number>();
  private allProducts: Product[] = [];
  searchTerm: string = '';
  selectedPriceRange: string = 'all';
  selectedSize: string[] = [];

  constructor(
    private modalCtrl: ModalController,
    private auth: AngularFireAuth,
    private firestore: AngularFirestore,
    private router: Router,
    private toastController: ToastController,
    private ngZone: NgZone,
    private formBuilder: FormBuilder,
    private injector: Injector,
    public cartService: CartService,  // Make cartService public
    private alertController: AlertController,
    private loadingController: LoadingController,
  ) {}

  async ngOnInit() {
    await this.loadProducts();
    await this.loadPromotions();
    await this.loadCartItems();
    
    // Check if user is already logged in
    this.auth.authState.subscribe(async (user) => {
      if (!user) {
        const modal = await this.modalCtrl.create({
          component: LoginComponent,
          backdropDismiss: false,
          cssClass: 'login-modal'
        });
        
        await modal.present();
        
        // Handle the modal result
        const { data, role } = await modal.onDidDismiss();
        console.log('Modal dismissed with data:', data, 'and role:', role);
      }
    });
    
    // Subscribe to cart updates
    this.cartSubscription = this.cartService.cartItems$.subscribe(cartMap => {
      this.cartItemCount = this.cartService.getTotalItems();
    });
  }

  ngOnDestroy() {
    if (this.cartSubscription) {
      this.cartSubscription.unsubscribe();
    }
  }

  private async loadProducts() {
    try {
      await this.ngZone.run(() => {
        return runInInjectionContext(this.injector, async () => {
          const snapshot = await this.firestore.collection('products').get().toPromise();
          const allProducts = snapshot?.docs.map(doc => ({ ...(doc.data() as object), product_id: doc.id })) as Product[];
          this.allProducts = allProducts;
          this.products = this.selectedCategory 
            ? allProducts.filter(p => p.category === this.selectedCategory)
            : allProducts;
          this.loading = false;
        });
      });
    } catch (error) {
      console.error('Error loading products:', error);
      this.loading = false;
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

    async verifyAdminPassword(password: string): Promise<boolean> {
      try {
        // Step 1: Get all admin users from Firestore
        const querySnapshot = await this.ngZone.run(() => {
          return runInInjectionContext(this.injector, async () => {
            return rxjsFirstValueFrom(
              this.firestore.collection('users', ref => 
                ref.where('role', '==', 'ADMIN')
              ).get()
            );
          });
        });
        
        if (!querySnapshot || querySnapshot.empty) {
          console.log('No admin users found');
          return false;
        }
        
        // Step 2: Get all Firebase Auth users
        const auth = await this.ngZone.run(() => {
          return runInInjectionContext(this.injector, async () => {
            return getAuth();
          });
        });
        
        // For each admin in Firestore, try to sign in with the password
        for (const doc of querySnapshot.docs) {
          const adminData = doc.data();
          const email = (adminData as { email?: string }).email; // Assuming email is stored in the user document
          
          if (!email) continue;
          
          try {
            // Try to sign in with this email and the provided password
            await this.ngZone.run(() => {
              return runInInjectionContext(this.injector, async () => {
                await signInWithEmailAndPassword(auth, email, password);
              });
            });
            
            // If we get here, authentication succeeded, so the user is an admin with valid credentials
            // Sign out immediately as we just needed to verify
            // await auth.signOut();
            return true;
          } catch (authError) {
            // This particular email/password combination didn't work
            // Continue to the next admin user
            console.log(`Failed auth attempt for email: ${email}`);
          }
        }
        
        // If we tried all admins and none worked
        return false;
      } catch (error) {
        console.error('Error verifying admin password:', error);
        return false;
      }
    }

    async confirmRemoveItem(item: CartItem) {
      const passwordAlert = await this.alertController.create({
        header: 'Admin Authorization Required',
        inputs: [
          {
            name: 'password',
            type: 'password',
            placeholder: 'Enter admin password'
          }
        ],
        buttons: [
          {
            text: 'Cancel',
            role: 'cancel'
          },
          {
            text: 'Verify',
            handler: async (data) => {
              const isAdmin = await this.verifyAdminPassword(data.password);
              if (isAdmin) {
                const confirmAlert = await this.alertController.create({
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
                await confirmAlert.present();
              } else {
                this.presentToast('Invalid admin password');
              }
            }
          }
        ]
      });
      await passwordAlert.present();
    }
  
    removeItem(item: CartItem) {
      this.cartService.removeFromCart(item.product_id);
      this.presentToast(`${item.name} removed from cart`);
    }
  
    async clearCart() {
      const passwordAlert = await this.alertController.create({
        header: 'Admin Authorization Required',
        inputs: [
          {
            name: 'password',
            type: 'password',
            placeholder: 'Enter admin password'
          }
        ],
        buttons: [
          {
            text: 'Cancel',
            role: 'cancel'
          },
          {
            text: 'Verify',
            handler: async (data) => {
              const isAdmin = await this.verifyAdminPassword(data.password);
              if (isAdmin) {
                const confirmAlert = await this.alertController.create({
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
                await confirmAlert.present();
              } else {
                this.presentToast('Invalid admin password');
              }
            }
          }
        ]
      });
      await passwordAlert.present();
    }

    async presentToast(message: string) {
      const toast = await this.toastController.create({
        message: message,
        duration: 2000,
        position: 'bottom'
      });
      toast.present();
    }

    selectPayment(method: 'cash' | 'card') {
      this.paymentMethod = method;
      this.cashAmount = '';
    }

    onNumpadPress(value: string | number) {
      if (value === 'C') {
        this.cashAmount = '';
        return;
      }

      if (value === '.' && this.cashAmount.includes('.')) {
        return;
      }

      if (value === '.' && !this.cashAmount) {
        this.cashAmount = '0.';
        return;
      }

      if (this.cashAmount.includes('.')) {
        const decimals = this.cashAmount.split('.')[1];
        if (decimals && decimals.length >= 2) return;
      }

      this.cashAmount += value.toString();
    }

    getChange(): number {
      const tendered = parseFloat(this.cashAmount) || 0;
      const total = this.getSubtotal() * 1.15; // Including VAT
      return Math.max(0, tendered - total);
    }

    async processCheckout(paymentReference: string) {
      if (!this.paymentMethod) {
        const alert = await this.alertController.create({
          header: 'Payment Method Required',
          message: 'Please select a payment method.',
          buttons: ['OK']
        });
        await alert.present();
        return;
      }

      if (this.paymentMethod === 'cash') {
        const tendered = parseFloat(this.cashAmount);
        const total = this.getSubtotal() * 1.15;
        
        if (!tendered || tendered < total) {
          const alert = await this.alertController.create({
            header: 'Invalid Amount',
            message: 'Please enter an amount equal to or greater than the total.',
            buttons: ['OK']
          });
          await alert.present();
          return;
        }
      }

      // Proceed with existing checkout logic
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

  private async loadPromotions() {
    try {
      const snapshot = await this.ngZone.run(() =>
        runInInjectionContext(this.injector, () =>
          this.firestore.collection('promotions').get().toPromise()
        )
      );
      this.promotions = snapshot?.docs.map(doc => doc.data() as Promotion) || [];
    } catch (error) {
      console.error('Error loading promotions:', error);
    }
  }

  getPromotion(promotionId: number | undefined): Promotion | null {
    if (!promotionId) return null;
    return this.promotions.find(p => p.promotion_id === promotionId) || null;
  }

  calculateDiscountedPrice(product: Product): number {
    const promotion = this.getPromotion(product.promotion_id);
    if (!promotion) return product.price;
    return product.price * (1 - promotion.discount_percentage / 100);
  }

  increaseQuantity(product: Product) {
    const currentQty = this.tempQuantities.get(product.product_id) || 0;
    this.tempQuantities.set(product.product_id, currentQty + 1);
  }

  decreaseQuantity(product: Product) {
    const currentQty = this.tempQuantities.get(product.product_id) || 0;
    if (currentQty > 0) {
      this.tempQuantities.set(product.product_id, currentQty - 1);
    }
  }

  getQuantity(product: Product): number {
    return this.tempQuantities.get(product.product_id) || 0;
  }

  async addToCart(product: Product) {
    const quantity = this.getQuantity(product);
    if (quantity > 0) {
      this.cartService.addToCart(product, quantity);
      this.tempQuantities.set(product.product_id, 0); // Reset quantity after adding to cart
      
      // Display a toast notification
      const toast = await this.toastController.create({
        message: `${quantity} ${product.name} added to cart`,
        duration: 2000,
        position: 'bottom'
      });
      toast.present();
    }
  }

  // Get current quantity in the actual cart (not the temp UI buffer)
  getCartQuantity(productId: string): number {
    return this.cartService.getQuantity(productId);
  }

  // Navigate to cart page
  viewCart() {
    this.router.navigate(['/cart']);
  }

  navigateToCart() {
    this.router.navigate(['/cart']);
  }

  selectCategory(category: ProductCategory) {
    this.selectedCategory = category;
    this.applyFilters();
  }

  async openModal() {
    const modal = await this.modalCtrl.create({
      component: LoginComponent,
      backdropDismiss: false,
      cssClass: 'login-modal'
    });
    
    await modal.present();
    
    const { data, role } = await modal.onDidDismiss();
    console.log('Modal dismissed with data:', data, 'and role:', role);
  }

  searchProducts(event: any) {
    this.searchTerm = event.detail.value.toLowerCase();
    this.applyFilters();
  }

  applyFilters() {
    // Start with all products if no category selected, otherwise filter by category
    let filteredProducts = this.selectedCategory 
      ? this.allProducts.filter(p => p.category === this.selectedCategory)
      : [...this.allProducts];

    // Apply search term filter
    if (this.searchTerm) {
      filteredProducts = filteredProducts.filter(p => 
        p.name.toLowerCase().includes(this.searchTerm)
      );
    }

    // Apply price range filter
    if (this.selectedPriceRange !== 'all') {
      const [min, max] = this.selectedPriceRange.split('-').map(n => parseInt(n));
      filteredProducts = filteredProducts.filter(p => {
        const price = this.calculateDiscountedPrice(p);
        if (this.selectedPriceRange === '201+') {
          return price > 200;
        }
        return price >= min && price <= max;
      });
    }

    // Apply size filter
    // if (this.selectedSize.length > 0) {
    //   filteredProducts = filteredProducts.filter(p => 
    //     this.selectedSize.some(size => p.size === size)
    //   );
    // }

    this.products = filteredProducts;
  }

  getSubtotal(): number {
    return this.cartItems.reduce((total, item) => total + (item.price * item.quantity), 0);
  }

  // Add helper methods for the template
  async decreaseCartQuantity(productId: string) {
    const passwordAlert = await this.alertController.create({
      header: 'Admin Authorization Required',
      inputs: [
        {
          name: 'password',
          type: 'password',
          placeholder: 'Enter admin password'
        }
      ],
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel'
        },
        {
          text: 'Verify',
          handler: async (data) => {
            const isAdmin = await this.verifyAdminPassword(data.password);
            if (isAdmin) {
              this.cartService.removeFromCart(productId);
            } else {
              this.presentToast('Invalid admin password');
            }
          }
        }
      ]
    });
    await passwordAlert.present();
  }

  increaseCartQuantity(item: CartItem) {
    this.cartService.addToCart({ product_id: item.product_id } as Product, 1);
  }

  readonly Date = Date; // Make Date available to template
}
