import { Component, OnInit, Injector, NgZone } from '@angular/core';
import { Product, ProductCategory } from '../shared/models/product';
import { Promotion } from '../shared/models/promotion';
import { AngularFireAuth } from '@angular/fire/compat/auth';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { Router } from '@angular/router';
import { ToastController } from '@ionic/angular';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { runInInjectionContext } from '@angular/core';

@Component({
  selector: 'app-admin-inventory',
  templateUrl: './admin-inventory.page.html',
  styleUrls: ['./admin-inventory.page.scss'],
  standalone: false,
})
export class AdminInventoryPage implements OnInit {
  selectedSegment = 'add';
  showForm = false;
  categories = ProductCategory;
  productForm: FormGroup;
  editForm: FormGroup;
  selectedFile: File | null = null;
  isSubmitting = false;
  products: Product[] = [];
  filteredProducts: Product[] = [];
  searchTerm = '';
  editingProduct: Product | null = null;
  promotions: Promotion[] = [];

  constructor(
    private auth: AngularFireAuth,
    private firestore: AngularFirestore,
    private router: Router,
    private toastController: ToastController,
    private ngZone: NgZone,
    private formBuilder: FormBuilder,
    private injector: Injector
  ) {
    this.productForm = this.formBuilder.group({
      name: ['', [Validators.required]],
      description: ['', [Validators.required]],
      price: ['', [Validators.required, Validators.min(0)]],
      stock_quantity: ['', [Validators.required, Validators.min(0)]],
      category: ['', [Validators.required]],
      image_url: [''], // Made optional since it's handled separately
      promotion_id: [null]
    });

    this.editForm = this.formBuilder.group({
      name: ['', [Validators.required]],
      description: ['', [Validators.required]],
      price: ['', [Validators.required, Validators.min(0)]],
      stock_quantity: ['', [Validators.required, Validators.min(0)]],
      category: ['', [Validators.required]],
      image_url: [''],
      promotion_id: [null]
    });

    this.loadPromotions();
  }

  ngOnInit() {
    this.loadProducts();
    this.loadPromotions();
  }

  async loadProducts() {
    try {
      const snapshot = await this.ngZone.run(() =>
        runInInjectionContext(this.injector, () =>
          this.firestore.collection('products').get().toPromise()
        )
      );

      this.products = snapshot?.docs.map(doc => doc.data() as Product) || [];
      this.filterProducts();
    } catch (error) {
      console.error('Error loading products:', error);
      this.showToast('Error loading products');
    }
  }

  async loadPromotions() {
    try {
      const snapshot = await this.ngZone.run(() =>
        runInInjectionContext(this.injector, () =>
          this.firestore.collection('promotions').get().toPromise()
        )
      );
      this.promotions = snapshot?.docs.map(doc => doc.data() as Promotion) || [];
    } catch (error) {
      console.error('Error loading promotions:', error);
      this.showToast('Error loading promotions');
    }
  }

  filterProducts() {
    if (!this.searchTerm) {
      this.filteredProducts = [...this.products];
      return;
    }

    const searchLower = this.searchTerm.toLowerCase();
    this.filteredProducts = this.products.filter(product =>
      product.name.toLowerCase().includes(searchLower) ||
      product.description.toLowerCase().includes(searchLower)
    );
  }

  segmentChanged(event: any) {
    if (event.detail.value === 'list') {
      this.loadProducts();
    }
  }

  async onSubmit() {
    if (this.productForm.invalid) {
      Object.keys(this.productForm.controls).forEach(key => {
        const control = this.productForm.get(key);
        if (control?.invalid) {
          control.markAsTouched();
        }
      });
      this.showToast('Please fill all required fields correctly');
      return;
    }

    this.isSubmitting = true;

    try {
      const snapshot = await this.ngZone.run(() => {
        return runInInjectionContext(this.injector, async () => {
          const productsRef = this.firestore.collection('products');
          return await productsRef.ref
            .orderBy('product_id', 'desc')
            .limit(1)
            .get();
        });
      });

      // Calculate next product_id
      let nextProductId = 1;
      if (!snapshot?.empty) {
        const highestProduct = snapshot.docs[0].data() as Product;
        nextProductId = (highestProduct.product_id || 0) + 1;
      }

      const product: Product = {
        product_id: nextProductId,
        ...this.productForm.value,
        created_at: new Date(),
        updated_at: new Date()
      };

      // If no promotion is selected, ensure promotion_id is undefined
      if (!product.promotion_id) {
        delete product.promotion_id;
      }

      await this.ngZone.run(() =>
        runInInjectionContext(this.injector, () =>
          this.firestore.collection('products').doc(nextProductId.toString()).set(product)
        )
      );

      this.showToast('Product added successfully');
      this.productForm.reset();
      this.selectedFile = null;
    } catch (error) {
      console.error(error);
      this.showToast('Error adding product');
    } finally {
      this.isSubmitting = false;
    }
  }

  async onFileSelected(event: any) {
    this.selectedFile = event.target.files[0];
    if (this.selectedFile) {
      try {
        const base64 = await this.convertToBase64(this.selectedFile);
        this.productForm.patchValue({
          image_url: base64
        });
        this.showToast('Image added successfully');
      } catch (error) {
        this.showToast('Error processing image');
        console.error(error);
      }
    }
  }

  editProduct(product: Product) {
    this.editingProduct = product;
    this.editForm.patchValue({
      name: product.name,
      description: product.description,
      price: product.price,
      stock_quantity: product.stock_quantity,
      category: product.category,
      image_url: product.image_url,
      promotion_id: product.promotion_id || null
    });
  }

  cancelEdit() {
    this.editingProduct = null;
    this.editForm.reset();
  }

  async saveEdit() {
    if (this.editForm.invalid || !this.editingProduct) {
      return;
    }

    this.isSubmitting = true;

    try {
      const updatedProduct = {
        ...this.editingProduct,
        ...this.editForm.value,
        updated_at: new Date()
      };

      // If no promotion is selected, remove promotion_id
      if (!updatedProduct.promotion_id) {
        delete updatedProduct.promotion_id;
      }

      await this.ngZone.run(() =>
        runInInjectionContext(this.injector, () =>
          this.firestore
            .collection('products')
            .doc(this.editingProduct!.product_id.toString())
            .update(updatedProduct)
        )
      );

      const index = this.products.findIndex(p => p.product_id === this.editingProduct!.product_id);
      if (index !== -1) {
        this.products[index] = updatedProduct;
      }
      this.filterProducts();

      this.showToast('Product updated successfully');
      this.cancelEdit();
    } catch (error) {
      console.error('Error updating product:', error);
      this.showToast('Error updating product');
    } finally {
      this.isSubmitting = false;
    }
  }

  async deleteProduct(product: Product) {
    try {
      await this.ngZone.run(() =>
        runInInjectionContext(this.injector, () =>
          this.firestore.collection('products').doc(product.product_id.toString()).delete()
        )
      );
      this.products = this.products.filter(p => p.product_id !== product.product_id);
      this.filterProducts();
      this.showToast('Product deleted successfully');
    } catch (error) {
      console.error('Error deleting product:', error);
      this.showToast('Error deleting product');
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

  private convertToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = error => reject(error);
    });
  }

  private async showToast(message: string) {
    const toast = await this.toastController.create({
      message: message,
      duration: 3000, // Increased duration for better readability
      position: 'bottom',
      color: message.includes('Error') ? 'danger' : 'success'
    });
    toast.present();
  }
}
