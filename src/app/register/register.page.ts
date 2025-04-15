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

  async onSubmit() {
    try {
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
            message: 'Registration successful!',
            duration: 2000,
            color: 'success'
          });
          await successToast.present();

          // Navigate to login page
          await this.router.navigate(['/home']);
          return successToast;
        });
      });
    } catch (error: any) {
      // Show error message
      const errorToast = await this.toastController.create({
        message: error.message || 'Registration failed',
        duration: 2000,
        color: 'danger'
      });
      await errorToast.present();
    }
  }
}
