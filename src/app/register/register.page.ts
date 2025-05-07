import { Component, OnInit, Injector, NgZone, runInInjectionContext } from '@angular/core';
import { User, UserRole } from '../shared/models/user';
import { AngularFireAuth } from '@angular/fire/compat/auth';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { Router } from '@angular/router';
import { ToastController } from '@ionic/angular';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-register',
  templateUrl: './register.page.html',
  styleUrls: ['./register.page.scss'],
  standalone: false,
})
export class RegisterPage implements OnInit {
  registerData: Partial<User> & { password: string } = {
    first_name: '',
    last_name: '',
    username: '',
    email: '',
    password: '',
    role: UserRole.CUSTOMER  // This will now be fixed to CUSTOMER
  };

  constructor(
    private auth: AngularFireAuth,
    private firestore: AngularFirestore,
    private router: Router,
    private toastController: ToastController,
    private ngZone: NgZone,
    private injector: Injector
  ) { }

  ngOnInit() { }

  private validatePassword(password: string): { isValid: boolean; message: string } {
    const minLength = 8;
    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumbers = /\d/.test(password);
    const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);

    if (password.length < minLength) {
      return { isValid: false, message: 'Your password needs to be at least 8 characters long' };
    }
    if (!hasUpperCase) {
      return { isValid: false, message: 'Please include at least one capital letter in your password' };
    }
    if (!hasLowerCase) {
      return { isValid: false, message: 'Please include at least one lowercase letter in your password' };
    }
    if (!hasNumbers) {
      return { isValid: false, message: 'Please include at least one number in your password' };
    }
    if (!hasSpecialChar) {
      return { isValid: false, message: 'Please include at least one special character (like !@#$%) in your password' };
    }

    return { isValid: true, message: '' };
  }

  async onSubmit() {
    try {
      // Validate password first
      const passwordValidation = this.validatePassword(this.registerData.password);
      if (!passwordValidation.isValid) {
        const errorToast = await this.toastController.create({
          message: passwordValidation.message,
          duration: 3000,
          color: 'danger'
        });
        await errorToast.present();
        return;
      }

      const toast = await this.ngZone.run(() => {
        return runInInjectionContext(this.injector, async () => {
          // Create authentication user
          const userCredential = await this.auth.createUserWithEmailAndPassword(
            this.registerData.email!,
            this.registerData.password
          );

          // Prepare user data for Firestore
          const userData: Partial<User> = {
            user_id: userCredential.user ? parseInt(userCredential.user.uid.substring(0, 8), 16) : 0,
            username: this.registerData.username,
            email: this.registerData.email,
            first_name: this.registerData.first_name,
            last_name: this.registerData.last_name,
            role: this.registerData.role,
            created_at: new Date(),
            updated_at: new Date()
          };

          // Store user data in Firestore
          if (userCredential.user) {
            await this.ngZone.run(() => {
              return runInInjectionContext(this.injector, async () => {
                await this.firestore.doc(`users/${userCredential.user!.uid}`).set(userData);
              });
            });
          } else {
            throw new Error('User credential is null');
          }

          // Show success message
          const successToast = await this.toastController.create({
            message: 'Welcome! Your account has been created successfully.',
            duration: 3000,
            color: 'success'
          });
          await successToast.present();

          // Navigate to login page
          await this.router.navigate(['/home']);
          return successToast;
        });
      });
    } catch (error: any) {
      let errorMessage = 'Something went wrong while creating your account. Please try again.';
      
      // Customize error messages for common scenarios
      if (error.code === 'auth/email-already-in-use') {
        errorMessage = 'This email is already registered. Please try logging in instead.';
      } else if (error.code === 'auth/invalid-email') {
        errorMessage = 'Please enter a valid email address.';
      } else if (error.code === 'auth/network-request-failed') {
        errorMessage = 'Network error. Please check your internet connection and try again.';
      }

      const errorToast = await this.toastController.create({
        message: errorMessage,
        duration: 3000,
        color: 'danger'
      });
      await errorToast.present();
    }
  }
}
