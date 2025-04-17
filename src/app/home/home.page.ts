// HomePage Component - Updated implementation
import { Component, OnInit, Injector, NgZone, OnDestroy } from '@angular/core';
import { Product, ProductCategory } from '../shared/models/product';
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
  loading: boolean = true;
  cartItemCount = 0;
  // Temporary buffer for items being modified in the UI before adding to cart
  tempQuantities = new Map<string, number>();
  private cartSubscription: Subscription | null = null;

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

  async ngOnInit() {
    await this.loadProducts();
    
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
          this.products = snapshot?.docs.map(doc => ({ ...(doc.data() as object), product_id: doc.id })) as Product[];
          this.loading = false;
        });
      });
    } catch (error) {
      console.error('Error loading products:', error);
      this.loading = false;
    }
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
}