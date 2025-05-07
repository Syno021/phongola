import { Component, OnInit, Input, Injector } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ModalController, ToastController, LoadingController } from '@ionic/angular';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { User, UserRole } from '../shared/models/user';
import { runInInjectionContext } from '@angular/core';

@Component({
  selector: 'app-user-modal',
  templateUrl: './user-modal.component.html',
  styleUrls: ['./user-modal.component.scss'],
  standalone: false,
})
export class UserModalComponent implements OnInit {
  @Input() user: User | null = null;
  
  userForm: FormGroup;
  isEditMode = false;
  userRoles = Object.values(UserRole);
  
  constructor(
    private formBuilder: FormBuilder,
    private modalCtrl: ModalController,
    private firestore: AngularFirestore,
    private toastController: ToastController,
    private loadingController: LoadingController,
    private injector: Injector
  ) {
    this.userForm = this.formBuilder.group({
      username: ['', [Validators.required]],
      email: ['', [Validators.required, Validators.email]],
      first_name: ['', [Validators.required]],
      last_name: ['', [Validators.required]],
      role: [UserRole.CUSTOMER, [Validators.required]],
    });
  }

  ngOnInit() {
    this.isEditMode = !!this.user;
    
    if (this.isEditMode && this.user) {
      this.userForm.patchValue({
        username: this.user.username,
        email: this.user.email,
        first_name: this.user.first_name,
        last_name: this.user.last_name,
        role: this.user.role
      });
      
      // Disable email for existing users
      this.userForm.get('email')?.disable();
    }
  }

  dismissModal(data?: any) {
    this.modalCtrl.dismiss(data);
  }

  async saveUser() {
    if (this.userForm.invalid) {
      this.markFormGroupTouched(this.userForm);
      return;
    }

    const loading = await this.loadingController.create({
      message: this.isEditMode ? 'Updating user...' : 'Creating user...'
    });
    await loading.present();

    try {
      if (this.isEditMode && this.user) {
        await this.updateUser();
      } else {
        await this.createUser();
      }
      
      loading.dismiss();
      this.dismissModal({ updated: true });
    } catch (error) {
      console.error('Error saving user:', error);
      const message = this.isEditMode ? 'Error updating user' : 'Error creating user';
      const errorMessage = (error as any)?.message || 'Unknown error';
      this.showToast(`${message}: ${errorMessage}`);
      loading.dismiss();
    }
  }

  private async updateUser() {
    if (!this.user) return;
    
    const userData = {
      username: this.userForm.value.username,
      first_name: this.userForm.value.first_name,
      last_name: this.userForm.value.last_name,
      role: this.userForm.value.role,
      updated_at: new Date()
    };

    return runInInjectionContext(this.injector, () => {
      return this.firestore.collection('users').doc(this.user?.user_id).update(userData);
    });
  }

  private async createUser() {
    // In a real app, you would likely call an API endpoint to create users with proper auth
    // This is a simplified version for demo purposes
    const userData = {
      username: this.userForm.value.username,
      email: this.userForm.value.email,
      first_name: this.userForm.value.first_name,
      last_name: this.userForm.value.last_name,
      role: this.userForm.value.role,
      password_hash: 'temporary_hash', // This should be generated securely on the backend
      created_at: new Date(),
      updated_at: new Date()
    };

    return runInInjectionContext(this.injector, () => {
      return this.firestore.collection('users').add(userData);
    });
  }

  private markFormGroupTouched(formGroup: FormGroup) {
    Object.values(formGroup.controls).forEach(control => {
      control.markAsTouched();
      
      if (control instanceof FormGroup) {
        this.markFormGroupTouched(control);
      }
    });
  }

  async showToast(message: string) {
    const toast = await this.toastController.create({
      message: message,
      duration: 2000,
      position: 'bottom',
      color: 'dark'
    });
    toast.present();
  }

  getRoleDescription(role: UserRole): string {
    switch (role) {
      case UserRole.ADMIN:
        return 'Full system access';
      case UserRole.MANAGER:
        return 'Manage inventory, reports and staff';
      case UserRole.CASHIER:
        return 'Process sales and handle transactions';
      case UserRole.CUSTOMER:
        return 'Basic user account';
      default:
        return '';
    }
  }
}