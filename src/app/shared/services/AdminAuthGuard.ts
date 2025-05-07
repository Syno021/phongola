import { Injectable, Injector, NgZone } from '@angular/core';
import { CanActivate, ActivatedRouteSnapshot, RouterStateSnapshot, Router } from '@angular/router';
import { AngularFireAuth } from '@angular/fire/compat/auth';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { Observable, of } from 'rxjs';
import { switchMap, map, take, tap } from 'rxjs/operators';
import { runInInjectionContext } from '@angular/core';
import { ToastController } from '@ionic/angular';

@Injectable({
  providedIn: 'root'
})
export class AdminAuthGuard implements CanActivate {
  constructor(
    private auth: AngularFireAuth,
    private firestore: AngularFirestore,
    private router: Router,
    private ngZone: NgZone,
    private injector: Injector,
    private toastController: ToastController
  ) {}

  canActivate(
    route: ActivatedRouteSnapshot,
    state: RouterStateSnapshot
  ): Observable<boolean> {
    return this.ngZone.run(() => 
      runInInjectionContext(this.injector, () => 
        this.auth.authState.pipe(
          take(1),
          switchMap(user => {
            // If not logged in, redirect to home
            if (!user) {
              this.showToast('Please login to access this page', 'warning');
              this.router.navigate(['/']);
              return of(false);
            }

            // Check if user has admin role
            return runInInjectionContext(this.injector, () => 
              this.firestore.collection('users').doc(user.uid).get()
            ).pipe(
              map(doc => {
                const userData = doc.data() as { role?: string };
                const isAdmin = userData?.role === 'ADMIN';
                
                if (!isAdmin) {
                  this.showToast('Access denied. Admin privileges required.', 'danger');
                  this.router.navigate(['/']);
                }
                
                return isAdmin;
              })
            );
          })
        )
      )
    );
  }

  private async showToast(message: string, color: string = 'danger') {
    const toast = await this.toastController.create({
      message: message,
      duration: 3000,
      position: 'bottom',
      color: color
    });
    toast.present();
  }
}