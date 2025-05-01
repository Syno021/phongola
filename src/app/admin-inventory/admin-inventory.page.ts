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
  productCategories: string[] = [];
  selectedSegment = 'add';
  showForm = false;
  categories = ProductCategory;
  ProductCategory = ProductCategory;
  productForm: FormGroup;
  editForm: FormGroup;
  selectedFile: File | null = null;
  isSubmitting = false;
  products: Product[] = [];
  filteredProducts: Product[] = [];
  searchTerm = '';
  editingProduct: Product | null = null;
  promotions: Promotion[] = [];
  
  // Default low stock threshold (used when product doesn't specify its own)
  defaultLowStockThreshold = 5;
  
  // Stock filtering options
  stockFilterOption = 'all'; // 'all', 'low', 'out'
  originalFilteredProducts: Product[] = []; // To store original filtered products before stock filter

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
      image_url: [''],
      promotion_id: [null],
      low_stock_threshold: [this.defaultLowStockThreshold, [Validators.min(1)]]
    });

    this.editForm = this.formBuilder.group({
      name: ['', [Validators.required]],
      description: ['', [Validators.required]],
      price: ['', [Validators.required, Validators.min(0)]],
      stock_quantity: ['', [Validators.required, Validators.min(0)]],
      category: ['', [Validators.required]],
      image_url: [''],
      promotion_id: [null],
      low_stock_threshold: [this.defaultLowStockThreshold, [Validators.min(1)]]
    });

    this.loadPromotions();
  }

  ngOnInit() {
    this.productCategories = Object.values(ProductCategory);
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

      this.products = snapshot?.docs.map(doc => {
        const product = doc.data() as Product;
        // Set default low stock threshold for products that don't have one
        if (product.low_stock_threshold === undefined) {
          product.low_stock_threshold = this.defaultLowStockThreshold;
        }
        return product;
      }) || [];
      
      this.filterProducts();
      
      // Check if any products have low stock and notify
      const lowStockCount = this.getLowStockCount();
      if (lowStockCount > 0) {
        this.showToast(`Warning: ${lowStockCount} product(s) have low stock!`, 'warning');
      }
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
      this.originalFilteredProducts = [...this.products];
    } else {
      const searchLower = this.searchTerm.toLowerCase();
      this.originalFilteredProducts = this.products.filter(product =>
        product.name.toLowerCase().includes(searchLower) ||
        product.description.toLowerCase().includes(searchLower)
      );
    }
    
    // Apply current stock filter
    this.applyStockFilter();
  }
  
  applyStockFilter() {
    switch (this.stockFilterOption) {
      case 'low':
        this.filteredProducts = this.originalFilteredProducts.filter(product => this.isLowStock(product));
        break;
      case 'out':
        this.filteredProducts = this.originalFilteredProducts.filter(product => this.isOutOfStock(product));
        break;
      default: // 'all'
        this.filteredProducts = [...this.originalFilteredProducts];
        break;
    }
  }
  
  filterLowStockOnly() {
    this.stockFilterOption = 'low';
    this.applyStockFilter();
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
      this.productForm.reset({
        low_stock_threshold: this.defaultLowStockThreshold // Reset with default value
      });
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
      promotion_id: product.promotion_id || null,
      low_stock_threshold: product.low_stock_threshold || this.defaultLowStockThreshold
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
  
  // Stock status methods
  isLowStock(product: Product): boolean {
    const threshold = product.low_stock_threshold || this.defaultLowStockThreshold;
    return product.stock_quantity > 0 && product.stock_quantity <= threshold;
  }
  
  isOutOfStock(product: Product): boolean {
    return product.stock_quantity <= 0;
  }
  
  getLowStockCount(): number {
    return this.products.filter(product => this.isLowStock(product)).length;
  }
  
  getStockStatusColor(product: Product): string {
    if (this.isOutOfStock(product)) {
      return 'light';  // Grey background for out of stock
    } else if (this.isLowStock(product)) {
      return 'warning-tint'; // Light yellow/orange background for low stock
    }
    return ''; // Default background
  }
  
  getStockStatusIcon(product: Product): string {
    if (this.isOutOfStock(product)) {
      return 'close-circle-outline';
    } else if (this.isLowStock(product)) {
      return 'alert-circle-outline';
    }
    return 'checkmark-circle-outline';
  }
  
  getStockIconColor(product: Product): string {
    if (this.isOutOfStock(product)) {
      return 'danger';
    } else if (this.isLowStock(product)) {
      return 'warning';
    }
    return 'success';
  }

  private convertToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = error => reject(error);
    });
  }

  private async showToast(message: string, color: string = 'success') {
    // Use 'success' for success messages, 'danger' for errors, 'warning' for warnings
    if (message.includes('Error')) {
      color = 'danger';
    }
    
    const toast = await this.toastController.create({
      message: message,
      duration: 3000,
      position: 'bottom',
      color: color
    });
    toast.present();
  }

  async logout() {
    try {
      await this.auth.signOut();
      this.router.navigate(['/']);
    } catch (error) {
      this.showToast('Error logging out');
    }
  }
}