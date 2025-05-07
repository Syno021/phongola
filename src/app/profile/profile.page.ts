import { Component, OnInit, Injector, OnDestroy } from '@angular/core';
import { AngularFireAuth } from '@angular/fire/compat/auth';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { Router } from '@angular/router';
import { ToastController, ModalController } from '@ionic/angular';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { runInInjectionContext } from '@angular/core';
import { LoginComponent } from '../login/login.component';
import { Subscription } from 'rxjs';
import { User, UserRole } from '../shared/models/user';
import firebase from 'firebase/compat/app';

interface CustomerAddress {
  address_id: string;
  user_id: string;
  address_line1: string;
  address_line2: string;
  city: string;
  state: string;
  postal_code: string;
  country: string;
  is_default: boolean;
  created_at: any;
}

interface OrderItem {
  name: string;
  price: number;
  product_id: string;
  quantity: number;
  image_url: any;
}

interface Order {
  id: string;
  amount: number;
  created_at: any;
  updated_at: any;
  delivery_address: CustomerAddress;
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
  user: User | null = null;
  addresses: CustomerAddress[] = [];
  profileForm: FormGroup;
  orders: Order[] = [];
  isLoading = true;
  userSubscription!: Subscription;
  ordersSubscription!: Subscription;
  addressesSubscription!: Subscription;
  authStateSubscription!: Subscription;

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
      first_name: ['', Validators.required],
      last_name: ['', Validators.required],
      email: ['', [Validators.required, Validators.email]],
      username: ['', Validators.required],
      role: ['']
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
    if (this.addressesSubscription) {
      this.addressesSubscription.unsubscribe();
    }
    if (this.authStateSubscription) {
      this.authStateSubscription.unsubscribe();
    }
  }

  checkAuthStatus() {
    this.authStateSubscription = this.auth.authState.subscribe(firebaseUser => {
      this.isLoading = false;
      if (firebaseUser) {
        this.loadOrCreateUserProfile(firebaseUser);
        this.loadUserOrders(firebaseUser.uid);
      } else {
        this.user = null;
        this.orders = [];
      }
    });
  }

  loadOrCreateUserProfile(firebaseUser: firebase.User) {
    runInInjectionContext(this.injector, () => {
      // Check if user exists in the users collection
      this.userSubscription = this.firestore.collection('users').doc(firebaseUser.uid).get().subscribe(async (doc) => {
        if (doc.exists) {
          // User already exists in collection
          const userData = doc.data() as User;
          
          // Ensure user_id is set correctly
          this.user = {
            ...userData,
            user_id: firebaseUser.uid // Explicitly set user_id from Firebase Auth
          };
          
          console.log('Loaded existing user:', this.user);
          
          this.profileForm.patchValue({
            first_name: this.user.first_name || '',
            last_name: this.user.last_name || '',
            email: this.user.email || '',
            username: this.user.username || '',
            role: this.user.role || UserRole.CUSTOMER
          });
        } else {
          // User doesn't exist in collection (likely Google sign-in)
          // Create new user with data from Google profile
          const newUser: User = {
            user_id: firebaseUser.uid, // Set the user_id correctly
            email: firebaseUser.email || '',
            first_name: this.extractFirstName(firebaseUser.displayName),
            last_name: this.extractLastName(firebaseUser.displayName),
            username: this.generateUsername(firebaseUser.displayName || firebaseUser.email || ''),
            role: UserRole.CUSTOMER,
            created_at: new Date(),
            updated_at: new Date(),
            password_hash: '' // Set an empty string or a default value for password_hash
          };
          
          // Save the new user to Firestore
          try {
            runInInjectionContext(this.injector, async () => {
              await this.firestore.collection('users').doc(firebaseUser.uid).set(newUser);
            });
            this.presentToast('Welcome! Your profile has been created');
            this.user = newUser;
            console.log('Created new user:', this.user);
            
            this.profileForm.patchValue({
              first_name: newUser.first_name || '',
              last_name: newUser.last_name || '',
              email: newUser.email || '',
              username: newUser.username || '',
              role: newUser.role || UserRole.CUSTOMER
            });
          } catch (error) {
            console.error('Error creating user profile:', error);
            this.presentToast('Unable to create your profile. Please try again');
          }
        }
        
        // Load addresses for the user
        this.loadCustomerAddresses(firebaseUser.uid);
      });
    });
  }

  // Helper methods to extract name components from displayName
  extractFirstName(displayName: string | null): string {
    if (!displayName) return '';
    return displayName.split(' ')[0] || '';
  }

  extractLastName(displayName: string | null): string {
    if (!displayName) return '';
    const nameParts = displayName.split(' ');
    return nameParts.length > 1 ? nameParts.slice(1).join(' ') : '';
  }

  // Generate a username from displayName or email
  generateUsername(input: string): string {
    // Remove spaces and special characters
    let username = input.split('@')[0]; // Use part before @ if it's an email
    username = username.replace(/[^\w]/g, '').toLowerCase();
    
    // Add a random number to make it more unique
    const randomNum = Math.floor(Math.random() * 1000);
    return `${username}${randomNum}`;
  }

  loadCustomerAddresses(userId: string) {
    runInInjectionContext(this.injector, () => {
      this.addressesSubscription = this.firestore
        .collection('customer_addresses', ref => 
          ref.where('user_id', '==', userId)
        )
        .snapshotChanges()
        .subscribe(actions => {
          this.addresses = actions.map(action => {
            const data = action.payload.doc.data() as CustomerAddress;
            const address_id = action.payload.doc.id;
            return { ...data, address_id };
          });
        });
    });
  }

  loadUserOrders(userId: string) {
    runInInjectionContext(this.injector, () => {
      // Simple query that only filters by user_id without ordering
      this.ordersSubscription = this.firestore.collection('orders', ref => 
        ref.where('user_id', '==', userId)
      ).snapshotChanges().subscribe(actions => {
        this.orders = actions.map(action => {
          const data = action.payload.doc.data() as Omit<Order, 'id'>;
          const id = action.payload.doc.id;
          return { id, ...data } as Order;
        });
        
        // Sort the orders client-side after retrieving them
        this.orders.sort((a, b) => {
          // Handle different timestamp formats safely
          const dateA = a.created_at?.toDate ? a.created_at.toDate() : new Date(a.created_at);
          const dateB = b.created_at?.toDate ? b.created_at.toDate() : new Date(b.created_at);
          return dateB.getTime() - dateA.getTime(); // descending order (newest first)
        });
        
        console.log('Loaded user orders:', this.orders);
      }, error => {
        console.error('Error loading orders:', error);
        this.orders = [];
        this.presentToast('Unable to load your orders. Please refresh the page');
      });
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
    if (!this.profileForm.valid) {
      this.presentToast('Please fill in all required fields before saving');
      return;
    }
    
    // Get current auth user to ensure we have the correct ID
    const currentUser = await this.auth.currentUser;
    if (!currentUser) {
      this.presentToast('Please sign in to update your profile');
      return;
    }
    
    const userId = currentUser.uid;
    
    if (!this.user) {
      console.warn('Local user object is null, creating new user object');
      this.user = {
        user_id: userId,
        email: this.profileForm.value.email,
        first_name: this.profileForm.value.first_name,
        last_name: this.profileForm.value.last_name,
        username: this.profileForm.value.username,
        role: this.profileForm.value.role || UserRole.CUSTOMER,
        created_at: new Date(),
        updated_at: new Date(),
        password_hash: ''
      };
    }
    
    try {
      console.log('Updating user with ID:', userId);
      
      // Create an updated user object with all required fields
      const updatedUser: Partial<User> = {
        first_name: this.profileForm.value.first_name,
        last_name: this.profileForm.value.last_name,
        email: this.profileForm.value.email,
        username: this.profileForm.value.username,
        role: this.profileForm.value.role || UserRole.CUSTOMER,
        updated_at: new Date()     // Update the timestamp
      };
      
      console.log('Updating user with data:', updatedUser);
      
      // Use set with merge instead of update to ensure it works
      // even if the document doesn't exist yet
      runInInjectionContext(this.injector, async () => {
        await this.firestore.collection('users').doc(userId).set(
          updatedUser, 
          { merge: true }
        );
      });
      
      // Update local user object to reflect changes
      this.user = { 
        ...this.user,
        ...updatedUser
      };
      
      this.presentToast('Your profile has been updated successfully');
    } catch (error) {
      console.error('Error updating profile:', error);
      this.presentToast('Unable to update your profile. Please try again');
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
      this.presentToast('You have been successfully signed out');
      this.router.navigate(['/home']);
    } catch (error) {
      console.error('Error signing out:', error);
      this.presentToast('Unable to sign out. Please try again');
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