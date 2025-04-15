import { Component, OnInit, Injector, NgZone } from '@angular/core';
import { Product, ProductCategory } from '../shared/models/product';
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
  showForm = false;
  categories = ProductCategory;
  productForm: FormGroup;
  selectedFile: File | null = null;
  isSubmitting = false;

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
      image_url: ['']  // Made optional since it's handled separately
    });
  }

  ngOnInit() {}

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
      duration: 3000,  // Increased duration for better readability
      position: 'bottom',
      color: message.includes('Error') ? 'danger' : 'success'
    });
    toast.present();
  }
}
