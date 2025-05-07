import { Component, OnInit, Injector, NgZone, runInInjectionContext, OnDestroy } from '@angular/core';
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
export class LoginComponent implements OnInit, OnDestroy {
  // Use a static flag to track if a modal is already open
  private static isModalOpen = false;
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

  ngOnInit() {
    // Set the modal as open when component initializes
    LoginComponent.isModalOpen = true;
  }

  ngOnDestroy() {
    // Reset the flag when component is destroyed
    LoginComponent.isModalOpen = false;
  }

  // Static method to check if modal is already open - can be called from other components
  public static isLoginModalOpen(): boolean {
    return LoginComponent.isModalOpen;
  }
  
  // Static method to create and present a login modal
  public static async presentLoginModal(modalCtrl: ModalController): Promise<boolean> {
    if (LoginComponent.isModalOpen) {
      return false; // Modal is already open, do nothing
    }
    
    // Set flag before creating the modal
    LoginComponent.isModalOpen = true;
    
    const modal = await modalCtrl.create({
      component: LoginComponent,
      backdropDismiss: false,
      cssClass: 'login-modal'
    });
    
    await modal.present();
    
    // Wait for the modal to be dismissed and handle result
    const { data, role } = await modal.onDidDismiss();
    return true; // Modal was shown and dismissed
  }

  async login() {
    try {
      await this.ngZone.run(() => {
        return runInInjectionContext(this.injector, async () => {
          const result = await this.auth.signInWithEmailAndPassword(this.email, this.password);
          if (result.user) {
            await this.handleModalClose();
            await this.checkUserRoleAndNavigate(result.user.uid);
          }
        });
      });
    } catch (error) {
      const errorMessage = this.getReadableErrorMessage((error as any).message);
      this.showToast(errorMessage);
    }
  }

  async loginWithGoogle() {
    try {
      await this.ngZone.run(() => {
        return runInInjectionContext(this.injector, async () => {
          const provider = new GoogleAuthProvider();
          const result = await this.auth.signInWithPopup(provider);
          
          if (result.user) {
            await this.handleModalClose();
            await this.checkUserRoleAndNavigate(result.user.uid);
          }
        });
      });
    } catch (error) {
      this.showToast('Unable to sign in with Google. Please try again.');
    }
  }

  private getReadableErrorMessage(errorMessage: string): string {
    if (errorMessage.includes('wrong-password') || errorMessage.includes('user-not-found')) {
      return 'Incorrect email or password. Please try again.';
    }
    if (errorMessage.includes('invalid-email')) {
      return 'Please enter a valid email address.';
    }
    if (errorMessage.includes('too-many-requests')) {
      return 'Too many failed attempts. Please try again later.';
    }
    if (errorMessage.includes('network-request-failed')) {
      return 'Network error. Please check your internet connection.';
    }
    return 'Unable to sign in. Please try again.';
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
          this.showToast('Unable to access your account. Please try again.');
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
    // Update the flag when modal is dismissed manually
    LoginComponent.isModalOpen = false;
    this.modalCtrl.dismiss();
  }

  private async handleModalClose() {
    // Update the flag when modal is closed
    LoginComponent.isModalOpen = false;
    await this.modalCtrl.dismiss(true, 'login-success');
    
    // Small delay to ensure modal dismissal completes
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  async goToRegister() {
    LoginComponent.isModalOpen = false;
    await this.modalCtrl.dismiss();
    this.router.navigate(['/register']);
  }

  async goToForgotPassword() {
    LoginComponent.isModalOpen = false;
    await this.modalCtrl.dismiss();
    this.router.navigate(['/forgot-password']);
  }
}