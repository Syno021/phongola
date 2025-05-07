// forgot-password.page.ts
import { Component, OnInit, Injector, NgZone } from '@angular/core';
import { AngularFireAuth } from '@angular/fire/compat/auth';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { Router } from '@angular/router';
import { ToastController, LoadingController } from '@ionic/angular';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { runInInjectionContext } from '@angular/core';

@Component({
  selector: 'app-forgot-password',
  templateUrl: './forgot-password.page.html',
  styleUrls: ['./forgot-password.page.scss'],
  standalone: false,
})
export class ForgotPasswordPage implements OnInit {
  resetPasswordForm!: FormGroup;
  isSubmitting = false;

  constructor(
    private auth: AngularFireAuth,
    private firestore: AngularFirestore,
    private router: Router,
    private toastController: ToastController,
    private loadingController: LoadingController,
    private ngZone: NgZone,
    private formBuilder: FormBuilder,
    private injector: Injector
  ) { }

  ngOnInit() {
    this.resetPasswordForm = this.formBuilder.group({
      email: ['', [Validators.required, Validators.email]]
    });
  }

  async resetPassword() {
    if (this.resetPasswordForm.invalid) {
      this.presentToast('Please enter a valid email address.', 'danger');
      return;
    }

    const email = this.resetPasswordForm.get('email')?.value ?? '';
    this.isSubmitting = true;
    
    const loading = await this.loadingController.create({
      message: 'Sending password reset email...',
      spinner: 'crescent'
    });
    await loading.present();

    try {
      // Use runInInjectionContext for Firebase operation
      await runInInjectionContext(this.injector, async () => {
        await this.auth.sendPasswordResetEmail(email);
      });

      this.ngZone.run(() => {
        loading.dismiss();
        this.isSubmitting = false;
        this.presentToast('Password reset email sent. Please check your inbox.', 'success');
        this.resetPasswordForm.reset();
      });
    } catch (error) {
      this.ngZone.run(() => {
        loading.dismiss();
        this.isSubmitting = false;
        let errorMessage = 'Failed to send password reset email.';
        
        const firebaseError = error as { code?: string }; // Explicitly cast error
        if (firebaseError.code === 'auth/user-not-found') {
          errorMessage = 'No account exists with this email address.';
        } else if (firebaseError.code === 'auth/invalid-email') {
          errorMessage = 'Invalid email format.';
        }
        
        this.presentToast(errorMessage, 'danger');
      });
    }
  }

  async presentToast(message: string, color: string) {
    const toast = await this.toastController.create({
      message: message,
      duration: 3000,
      position: 'bottom',
      color: color
    });
    toast.present();
  }

  goToLogin() {
    this.router.navigate(['/home']);
  }
}