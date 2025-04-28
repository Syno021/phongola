import { Component, OnInit, Injector, NgZone, OnDestroy } from '@angular/core';
import { AngularFireAuth } from '@angular/fire/compat/auth';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { Router } from '@angular/router';
import { ToastController, ModalController } from '@ionic/angular';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { runInInjectionContext } from '@angular/core';
import { LoginComponent } from '../login/login.component';
import { Subscription } from 'rxjs';

interface DeliveryAddress {
  address_id: string;
  address_line1: string;
  address_line2: string;
  city: string;
  country: string;
  created_at: any;
  is_default: boolean;
  postal_code: string;
  state: string;
  user_id: string;
}

interface OrderItem {
  name: string;
  price: number;
  product_id: string;
  quantity: number;
}

interface Order {
  id: string;
  amount: number;
  created_at: any;
  updated_at: any;
  delivery_address: DeliveryAddress;
  delivery_fee: number;
  delivery_method: string;
  items: OrderItem[];
  order_reference: string;
  payment_status: string;
  status: string;
  user_email: string;
  user_id: string;
}

@Component({
  selector: 'app-profile',
  templateUrl: './profile.page.html',
  styleUrls: ['./profile.page.scss'],
  standalone: false,
})
export class ProfilePage implements OnInit, OnDestroy {
  user: any = null;
  profileForm: FormGroup;
  orders: Order[] = [];
  isLoading = true;
  userSubscription!: Subscription;
  ordersSubscription!: Subscription;
  
  constructor(
    private modalCtrl: ModalController,
    private auth: AngularFireAuth,
    private firestore: AngularFirestore,
    private router: Router,
    private toastController: ToastController,
    private formBuilder: FormBuilder,
    private injector: Injector
  ) {
    this.profileForm = this.formBuilder.group({
      name: ['', Validators.required],
      email: ['', [Validators.required, Validators.email]],
      phone: ['', Validators.pattern('[0-9]{10}')],
      address: [''],
      city: [''],
      state: [''],
      zipcode: ['']
    });
  }

  ngOnInit() {
    this.checkAuthStatus();
  }
  
  ngOnDestroy() {
    if (this.userSubscription) {
      this.userSubscription.unsubscribe();
    }
    if (this.ordersSubscription) {
      this.ordersSubscription.unsubscribe();
    }
  }

  checkAuthStatus() {
    this.userSubscription = this.auth.authState.subscribe(user => {
      this.isLoading = false;
      if (user) {
        this.user = user;
        this.loadUserProfile(user.uid);
        this.loadUserOrders(user.uid);
      } else {
        this.user = null;
        this.orders = [];
      }
    });
  }

  loadUserProfile(userId: string) {
    runInInjectionContext(this.injector, () => {
      this.firestore.collection('users').doc(userId).get().subscribe((doc) => {
        if (doc.exists) {
          const userData = doc.data() as any;
          this.profileForm.patchValue({
            name: userData.name || '',
            email: userData.email || this.user.email || '',
            phone: userData.phone || '',
            address: userData.address || '',
            city: userData.city || '',
            state: userData.state || '',
            zipcode: userData.zipcode || ''
          });
        }
      });
    });
  }

  loadUserOrders(userId: string) {
    runInInjectionContext(this.injector, () => {
      try {
        this.ordersSubscription = this.firestore.collection('orders', ref => 
          ref.where('user_id', '==', userId).orderBy('created_at', 'desc')
        ).snapshotChanges().subscribe(actions => {
          this.orders = actions.map(action => {
            const data = action.payload.doc.data() as Omit<Order, 'id'>;
            const id = action.payload.doc.id;
            return { id, ...data } as Order;
          });
          console.log('Loaded orders:', this.orders);
        }, error => {
          console.error('Error loading orders:', error);
          // Try a simpler query as fallback
          this.loadOrdersWithoutSorting(userId);
        });
      } catch (error) {
        console.error('Exception loading orders:', error);
        this.loadOrdersWithoutSorting(userId);
      }
    });
  }
  
  // Fallback method that doesn't use orderBy
  loadOrdersWithoutSorting(userId: string) {
    runInInjectionContext(this.injector, () => {
      this.firestore.collection('orders', ref => 
        ref.where('user_id', '==', userId)
      ).snapshotChanges().subscribe(actions => {
        this.orders = actions.map(action => {
          const data = action.payload.doc.data() as Omit<Order, 'id'>;
          const id = action.payload.doc.id;
          return { id, ...data } as Order;
        });
        // Sort the orders client-side
        this.orders.sort((a, b) => {
          const dateA = a.created_at?.toDate ? a.created_at.toDate() : new Date(a.created_at);
          const dateB = b.created_at?.toDate ? b.created_at.toDate() : new Date(b.created_at);
          return dateB.getTime() - dateA.getTime(); // descending order
        });
        console.log('Loaded orders (fallback):', this.orders);
      }, error => {
        console.error('Error in fallback order loading:', error);
        this.orders = [];
      });
    });
  }

  async updateProfile() {
    if (!this.user || !this.profileForm.valid) return;
    
    try {
      await this.firestore.collection('users').doc(this.user.uid).set(
        this.profileForm.value, 
        { merge: true }
      );
      
      this.presentToast('Profile updated successfully');
    } catch (error) {
      this.presentToast('Error updating profile');
      console.error(error);
    }
  }

  async openLogin() {
    const modal = await this.modalCtrl.create({
      component: LoginComponent
    });
    return await modal.present();
  }

  async logout() {
    try {
      await this.auth.signOut();
      this.presentToast('Logged out successfully');
      this.router.navigate(['/home']);
    } catch (error) {
      console.error('Error signing out:', error);
    }
  }

  getOrderStatusClass(status: string): string {
    switch (status.toLowerCase()) {
      case 'processing': return 'status-processing';
      case 'shipped': return 'status-shipped';
      case 'delivered': return 'status-delivered';
      case 'cancelled': return 'status-cancelled';
      default: return '';
    }
  }

  navigateToOrderDetail(orderId: string) {
    this.router.navigate(['/order-detail', orderId]);
  }

  async presentToast(message: string) {
    const toast = await this.toastController.create({
      message: message,
      duration: 2000,
      position: 'bottom'
    });
    toast.present();
  }
}