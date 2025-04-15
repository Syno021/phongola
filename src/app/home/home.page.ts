import { Component, OnInit, Injector, NgZone } from '@angular/core';
import { Product, ProductCategory } from '../shared/models/product';
import { AngularFireAuth } from '@angular/fire/compat/auth';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { Router } from '@angular/router';
import { ToastController } from '@ionic/angular';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { runInInjectionContext } from '@angular/core';
import { ModalController } from '@ionic/angular';
import { LoginComponent } from '../login/login.component';

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  standalone: false,
})
export class HomePage implements OnInit {
  products: Product[] = [];
  loading: boolean = true;
  private cartMap = new Map<string, number>();

  constructor(
    private modalCtrl: ModalController,
    private auth: AngularFireAuth,
    private firestore: AngularFirestore,
    private router: Router,
    private toastController: ToastController,
    private ngZone: NgZone,
    private formBuilder: FormBuilder,
    private injector: Injector
  ) {}

  async ngOnInit() {
    await this.loadProducts();
    const modal = await this.modalCtrl.create({
      component: LoginComponent,
      backdropDismiss: false
    });
    await modal.present();
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
    const currentQty = this.cartMap.get(product.product_id) || 0;
    this.cartMap.set(product.product_id, currentQty + 1);
  }

  decreaseQuantity(product: Product) {
    const currentQty = this.cartMap.get(product.product_id) || 0;
    if (currentQty > 0) {
      this.cartMap.set(product.product_id, currentQty - 1);
    }
  }

  getQuantity(product: Product): number {
    return this.cartMap.get(product.product_id) || 0;
  }

  addToCart(product: Product) {
    const quantity = this.getQuantity(product);
    if (quantity > 0) {
      // Implement your cart logic here
      console.log('Adding to cart:', product, 'quantity:', quantity);
    }
  }
}
