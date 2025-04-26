import { Component, OnInit, Injector, NgZone, runInInjectionContext } from '@angular/core';
import { User, UserRole } from '../shared/models/user';
import { AngularFireAuth } from '@angular/fire/compat/auth';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { Router } from '@angular/router';
import { ToastController, ModalController } from '@ionic/angular';
import { GoogleAuthProvider } from 'firebase/auth';

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss'],
  standalone: false,
})
export class LoginComponent implements OnInit {
  email: string = '';
  password: string = '';

  constructor(
    private auth: AngularFireAuth,
    private firestore: AngularFirestore,
    private router: Router,
    private toastController: ToastController,
    private ngZone: NgZone,
    private injector: Injector,
    private modalCtrl: ModalController
  ) { }

  ngOnInit() {}

  async login() {
    try {
      await this.ngZone.run(() => {
        return runInInjectionContext(this.injector, async () => {
          const result = await this.auth.signInWithEmailAndPassword(this.email, this.password);
          if (result.user) {
            // First dismiss the modal
            await this.modalCtrl.dismiss(true, 'login-success');
            
            // Small delay to ensure modal dismissal completes
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // Then check role and navigate
            await this.checkUserRoleAndNavigate(result.user.uid);
          }
        });
      });
    } catch (error) {
      this.showToast('Login failed: ' + (error as any).message);
    }
  }

  async loginWithGoogle() {
    try {
      await this.ngZone.run(() => {
        return runInInjectionContext(this.injector, async () => {
          const provider = new GoogleAuthProvider();
          const result = await this.auth.signInWithPopup(provider);
          
          if (result.user) {
            // First dismiss the modal
            await this.modalCtrl.dismiss(true, 'login-success');
            
            // Small delay to ensure modal dismissal completes
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // Then check role and navigate
            await this.checkUserRoleAndNavigate(result.user.uid);
          }
        });
      });
    } catch (error) {
      this.showToast('Google login failed: ' + (error as any).message);
    }
  }

  private async checkUserRoleAndNavigate(userId: string) {
    await this.ngZone.run(() => {
      return runInInjectionContext(this.injector, async () => {
        try {
          const userDoc = await this.firestore.collection('users').doc(userId).get().toPromise();
          
          if (userDoc && userDoc.exists) {
            const userData = userDoc.data() as User;
            
            if (userData.role === UserRole.ADMIN) {
              await this.router.navigate(['/admin-inventory']);
            } else {
              await this.router.navigate(['/home']);
              window.location.reload();
            }
          }
        } catch (error) {
          console.error('Error during navigation:', error);
          this.showToast('Navigation error: ' + (error as any).message);
        }
      });
    });
  }

  private async showToast(message: string) {
    const toast = await this.toastController.create({
      message,
      duration: 2000,
      position: 'bottom'
    });
    toast.present();
  }

  dismiss() {
    this.modalCtrl.dismiss();
  }

  async goToRegister() {
    await this.modalCtrl.dismiss();
    this.router.navigate(['/register']);
  }
}
