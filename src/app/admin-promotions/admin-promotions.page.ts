import { Component, OnInit, Injector, NgZone } from '@angular/core';
import { Promotion } from '../shared/models/promotion';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { AngularFireAuth } from '@angular/fire/compat/auth';
import { ToastController } from '@ionic/angular';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { runInInjectionContext } from '@angular/core';
import { Router } from '@angular/router';

@Component({
  selector: 'app-admin-promotions',
  templateUrl: './admin-promotions.page.html',
  styleUrls: ['./admin-promotions.page.scss'],
  standalone: false,
})
export class AdminPromotionsPage implements OnInit {
  selectedSegment = 'add';
  showForm = false;
  promotionForm: FormGroup;
  editForm: FormGroup;
  isSubmitting = false;
  promotions: Promotion[] = [];
  editingPromotion: Promotion | null = null;

  constructor(
    private auth: AngularFireAuth,
    private firestore: AngularFirestore,
    private router: Router,
    private toastController: ToastController,
    private formBuilder: FormBuilder,
    private ngZone: NgZone,
    private injector: Injector
  ) {
    this.promotionForm = this.formBuilder.group({
      name: ['', [Validators.required]],
      description: ['', [Validators.required]],
      discount_percentage: ['', [Validators.required, Validators.min(0), Validators.max(100)]],
      start_date: ['', [Validators.required]],
      end_date: ['', [Validators.required]]
    });

    this.editForm = this.formBuilder.group({
      name: ['', [Validators.required]],
      description: ['', [Validators.required]],
      discount_percentage: ['', [Validators.required, Validators.min(0), Validators.max(100)]],
      start_date: ['', [Validators.required]],
      end_date: ['', [Validators.required]]
    });
  }

  ngOnInit() {
    this.loadPromotions();
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

  async onSubmit() {
    if (this.promotionForm.invalid) {
      this.showToast('Please fill all required fields correctly');
      return;
    }

    this.isSubmitting = true;

    try {
      const formValues = this.promotionForm.value;
      const startDate = new Date(formValues.start_date);
      const endDate = new Date(formValues.end_date);

      const snapshot = await this.ngZone.run(() =>
        runInInjectionContext(this.injector, () =>
          this.firestore.collection('promotions')
            .ref.orderBy('promotion_id', 'desc')
            .limit(1)
            .get()
        )
      );

      let nextPromotionId = 1;
      if (!snapshot?.empty) {
        const highestPromotion = snapshot.docs[0].data() as Promotion;
        nextPromotionId = (highestPromotion.promotion_id || 0) + 1;
      }

      const promotion: Promotion = {
        promotion_id: nextPromotionId,
        ...formValues,
        start_date: startDate,
        end_date: endDate,
        created_at: new Date(),
        updated_at: new Date()
      };

      await this.ngZone.run(() =>
        runInInjectionContext(this.injector, () =>
          this.firestore.collection('promotions')
            .doc(nextPromotionId.toString())
            .set(promotion)
        )
      );

      this.showToast('Promotion added successfully');
      this.promotionForm.reset();
      this.loadPromotions();
    } catch (error) {
      console.error(error);
      this.showToast('Error adding promotion');
    } finally {
      this.isSubmitting = false;
    }
  }

  editPromotion(promotion: Promotion) {
    this.editingPromotion = promotion;
    this.editForm.patchValue({
      name: promotion.name,
      description: promotion.description,
      discount_percentage: promotion.discount_percentage,
      start_date: new Date(promotion.start_date).toISOString().split('T')[0],
      end_date: new Date(promotion.end_date).toISOString().split('T')[0]
    });
  }

  cancelEdit() {
    this.editingPromotion = null;
    this.editForm.reset();
  }

  async saveEdit() {
    if (this.editForm.invalid || !this.editingPromotion) {
      return;
    }

    this.isSubmitting = true;

    try {
      const formValues = this.editForm.value;
      const updatedPromotion = {
        ...this.editingPromotion,
        ...formValues,
        start_date: new Date(formValues.start_date),
        end_date: new Date(formValues.end_date),
        updated_at: new Date()
      };

      await this.ngZone.run(() =>
        runInInjectionContext(this.injector, () =>
          this.firestore.collection('promotions')
            .doc(this.editingPromotion!.promotion_id.toString())
            .update(updatedPromotion)
        )
      );

      this.showToast('Promotion updated successfully');
      this.cancelEdit();
      this.loadPromotions();
    } catch (error) {
      console.error('Error updating promotion:', error);
      this.showToast('Error updating promotion');
    } finally {
      this.isSubmitting = false;
    }
  }

  async deletePromotion(promotion: Promotion) {
    try {
      await this.ngZone.run(() =>
        runInInjectionContext(this.injector, () =>
          this.firestore.collection('promotions')
            .doc(promotion.promotion_id.toString())
            .delete()
        )
      );
      this.showToast('Promotion deleted successfully');
      this.loadPromotions();
    } catch (error) {
      console.error('Error deleting promotion:', error);
      this.showToast('Error deleting promotion');
    }
  }

  private async showToast(message: string) {
    const toast = await this.toastController.create({
      message: message,
      duration: 3000,
      position: 'bottom',
      color: message.includes('Error') ? 'danger' : 'success'
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