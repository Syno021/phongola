import { Component, OnInit, Injector, NgZone, OnDestroy } from '@angular/core';
import { Product, ProductCategory } from '../shared/models/product';
import { Promotion } from '../shared/models/promotion';
import { AngularFireAuth } from '@angular/fire/compat/auth';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { Router } from '@angular/router';
import { ToastController } from '@ionic/angular';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { runInInjectionContext } from '@angular/core';
import { ModalController } from '@ionic/angular';
import { LoginComponent } from '../login/login.component';
import { CartService } from '../shared/services/cart.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  standalone: false,
})
export class HomePage implements OnInit, OnDestroy {
  products: Product[] = [];
  promotions: Promotion[] = [];
  loading: boolean = true;
  cartItemCount = 0;
  selectedCategory: ProductCategory | null = null;
  categories = Object.values(ProductCategory);
  // Temporary buffer for items being modified in the UI before adding to cart
  tempQuantities = new Map<string, number>();
  private cartSubscription: Subscription | null = null;
  private authSubscription: Subscription | null = null;
  private allProducts: Product[] = [];
  searchTerm: string = '';
  selectedPriceRange: string = 'all';
  selectedSize: string[] = [];
  currentUser: string | null = null;

  constructor(
    private modalCtrl: ModalController,
    private auth: AngularFireAuth,
    private firestore: AngularFirestore,
    private router: Router,
    private toastController: ToastController,
    private ngZone: NgZone,
    private formBuilder: FormBuilder,
    private injector: Injector,
    private cartService: CartService
  ) {}

  ngOnInit() {
    // Will be handled by ionViewWillEnter
  }

  // This method is called every time the page is navigated to
  ionViewWillEnter() {
    this.resetPageState();
    this.loadPageData();
  }

  // Clear all previous data
  private resetPageState() {
    this.products = [];
    this.promotions = [];
    this.allProducts = [];
    this.loading = true;
    this.selectedCategory = null;
    this.searchTerm = '';
    this.selectedPriceRange = 'all';
    this.selectedSize = [];
    this.currentUser = null;
    this.tempQuantities = new Map<string, number>();
    
    // Unsubscribe from previous subscriptions to prevent memory leaks
    if (this.cartSubscription) {
      this.cartSubscription.unsubscribe();
      this.cartSubscription = null;
    }
    
    if (this.authSubscription) {
      this.authSubscription.unsubscribe();
      this.authSubscription = null;
    }
  }

  private async loadPageData() {
    await this.loadProducts();
    await this.loadPromotions();
    
    // Check if user is already logged in
    this.authSubscription = this.auth.authState.subscribe(async (user) => {
      if (!user) {
        // Use the static method from LoginComponent to show the modal
        await LoginComponent.presentLoginModal(this.modalCtrl);
        // Reset user data
        this.currentUser = null;
      } else {
        try {
          const userData = await this.ngZone.run(() =>
            runInInjectionContext(this.injector, async () => {
              const userDoc = await this.firestore.collection('users').doc(user.uid).get().toPromise();
              return userDoc ? (userDoc.data() as { username?: string }) : null;
            })
          );
          
          this.currentUser = 
            (userData && userData.username) || 
            user.displayName || 
            user.email || 
            'User';
        } catch (error) {
          console.error('Error fetching user data:', error);
          this.currentUser = user.displayName || user.email || 'User';
        }
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
    
    if (this.authSubscription) {
      this.authSubscription.unsubscribe();
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
    if (product.stock_quantity <= 0) {
      this.presentToast('Sorry, this item is currently out of stock');
      return;
    }
    
    const currentQty = this.tempQuantities.get(product.product_id) || 0;
    if (currentQty < product.stock_quantity) {
      this.tempQuantities.set(product.product_id, currentQty + 1);
    } else {
      this.presentToast(`Sorry, we only have ${product.stock_quantity} items left in stock`);
    }
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
    if (product.stock_quantity <= 0) {
      this.presentToast('Sorry, this item is currently out of stock');
      return;
    }
    
    const quantity = this.getQuantity(product);
    if (quantity > 0) {
      const validQuantity = Math.min(quantity, product.stock_quantity);
      
      if (validQuantity !== quantity) {
        this.presentToast(`Limited stock available. Adding ${validQuantity} items to your cart`);
      }
      
      this.cartService.addToCart(product, validQuantity);
      this.tempQuantities.set(product.product_id, 0);
      
      const toast = await this.toastController.create({
        message: `Added ${validQuantity} ${product.name}${validQuantity > 1 ? 's' : ''} to your cart`,
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

  selectCategory(category: ProductCategory | null) {
    this.selectedCategory = category;
    this.applyFilters();
  }

  // Updated to use the static method for showing the login modal
  async openModal() {
    await LoginComponent.presentLoginModal(this.modalCtrl);
  }

  searchProducts(event: any) {
    this.searchTerm = event.detail.value.toLowerCase();
    this.applyFilters();
  }

  applyFilters() {
    // Start with all products regardless of category
    let filteredProducts = [...this.allProducts];

    // Apply category filter if one is selected
    if (this.selectedCategory) {
      filteredProducts = filteredProducts.filter(p => p.category === this.selectedCategory);
    }
    
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

    // Apply size filter if needed
    // if (this.selectedSize.length > 0) {
    //   filteredProducts = filteredProducts.filter(p => 
    //     this.selectedSize.some(size => p.size === size)
    //   );
    // }

    this.products = filteredProducts;
  }

  async presentToast(message: string, duration: number = 2000) {
    const toast = await this.toastController.create({
      message: message,
      duration: duration,
      position: 'bottom'
    });
    await toast.present();
  }

  async logout() {
    try {
      await this.auth.signOut();
      this.cartService.clearCart();
      this.router.navigate(['/']);
    } catch (error) {
      this.presentToast('Unable to log out. Please try again');
    }
  }

  navigateToProfile() {
    this.router.navigate(['/profile']);
  }

  isLowStock(stockQuantity: number): boolean {
    return stockQuantity > 0 && stockQuantity < 11;
  }

  // This method is called when the page is about to be left
  ionViewWillLeave() {
    // You can perform additional cleanup here if needed
  }
}