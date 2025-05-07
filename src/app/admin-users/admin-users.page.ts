import { Component, OnInit, Injector, OnDestroy } from '@angular/core';
import { AngularFireAuth } from '@angular/fire/compat/auth';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { Router } from '@angular/router';
import { ToastController, ModalController, LoadingController, AlertController } from '@ionic/angular';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { runInInjectionContext } from '@angular/core';
import { LoginComponent } from '../login/login.component';
import { Subscription } from 'rxjs';
import { User, UserRole } from '../shared/models/user';
import firebase from 'firebase/compat/app';
import { UserModalComponent } from '../user-modal/user-modal.component';

interface RoleFilter {
  value: UserRole;
  active: boolean;
}

@Component({
  selector: 'app-admin-users',
  templateUrl: './admin-users.page.html',
  styleUrls: ['./admin-users.page.scss'],
  standalone: false,
})
export class AdminUsersPage implements OnInit, OnDestroy {
  users: User[] = [];
  filteredUsers: User[] = [];
  isLoading = false;
  private usersSubscription: Subscription | null = null;
  currentUser: firebase.User | null = null;
  isAdmin = false;
  searchTerm = '';
  
  // Role filters
  roleFilters: RoleFilter[] = [
    { value: UserRole.ADMIN, active: false },
    { value: UserRole.MANAGER, active: false },
    { value: UserRole.CASHIER, active: false },
    { value: UserRole.CUSTOMER, active: false }
  ];
  
  constructor(
    private modalCtrl: ModalController,
    private auth: AngularFireAuth,
    private firestore: AngularFirestore,
    private router: Router,
    private toastController: ToastController,
    private formBuilder: FormBuilder,
    private injector: Injector,
    private loadingController: LoadingController,
    private alertController: AlertController
  ) { }

  ngOnInit() {
    this.checkAuth();
    this.loadUsers();
  }

  ngOnDestroy() {
    if (this.usersSubscription) {
      this.usersSubscription.unsubscribe();
    }
  }

  checkAuth() {
    runInInjectionContext(this.injector, () => {
      this.auth.authState.subscribe(user => {
        this.currentUser = user;
        
        if (user) {
          // Check if current user is admin
          runInInjectionContext(this.injector, () => {
            this.firestore.collection('users').doc(user.uid).get().subscribe(doc => {
              const userData = doc.data() as User;
              this.isAdmin = userData?.role === UserRole.ADMIN;
              
              if (!this.isAdmin) {
                this.showToast('You do not have permission to access this page.');
                this.router.navigate(['/home']);
              }
            });
          });
        } else {
          this.router.navigate(['/login']);
        }
      });
    });
  }

  loadUsers() {
    this.isLoading = true;
    
    runInInjectionContext(this.injector, () => {
      this.usersSubscription = this.firestore.collection<User>('users')
        .valueChanges({ idField: 'user_id' })
        .subscribe(
          (users) => {
            this.users = users;
            this.filterUsers(); // Apply filters immediately after loading
            this.isLoading = false;
          },
          (error) => {
            console.error('Error fetching users:', error);
            this.showToast('Error loading users. Please try again.');
            this.isLoading = false;
          }
        );
    });
  }
  
  filterUsers() {
    // Start with all users
    let result = [...this.users];
    
    // Apply search term filter
    if (this.searchTerm.trim() !== '') {
      const term = this.searchTerm.toLowerCase().trim();
      result = result.filter(user => 
        `${user.first_name} ${user.last_name}`.toLowerCase().includes(term) ||
        (user.email && user.email.toLowerCase().includes(term)) ||
        (user.username && user.username.toLowerCase().includes(term))
      );
    }
    
    // Apply role filters if any are active
    const activeRoleFilters = this.roleFilters.filter(rf => rf.active).map(rf => rf.value);
    
    if (activeRoleFilters.length > 0) {
      result = result.filter(user => activeRoleFilters.includes(user.role));
    }
    
    this.filteredUsers = result;
  }
  
  toggleRoleFilter(roleFilter: RoleFilter) {
    roleFilter.active = !roleFilter.active;
    this.filterUsers();
  }
  
  hasActiveFilters(): boolean {
    return this.roleFilters.some(rf => rf.active);
  }
  
  clearFilters() {
    this.searchTerm = '';
    this.roleFilters.forEach(rf => rf.active = false);
    this.filterUsers();
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

  async openUserModal(user?: User) {
    const modal = await this.modalCtrl.create({
      component: UserModalComponent,
      componentProps: {
        user: user ? {...user} : null
      }
    });

    await modal.present();

    const { data } = await modal.onDidDismiss();
    if (data && data.updated) {
      this.showToast('User updated successfully');
    }
  }

  getRoleColor(role: UserRole): string {
    switch (role) {
      case UserRole.ADMIN:
        return 'danger';
      case UserRole.MANAGER:
        return 'warning';
      case UserRole.CASHIER:
        return 'success';
      case UserRole.CUSTOMER:
        return 'primary';
      default:
        return 'medium';
    }
  }

  async deleteUser(user: User, event: Event) {
    event.stopPropagation();
    
    if (user.user_id === this.currentUser?.uid) {
      this.showToast('You cannot delete your own account!');
      return;
    }

    const alert = await this.alertController.create({
      header: 'Confirm Delete',
      message: `Are you sure you want to delete ${user.first_name} ${user.last_name}?`,
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel'
        },
        {
          text: 'Delete',
          handler: () => {
            this.performDeleteUser(user);
          }
        }
      ]
    });

    await alert.present();
  }

  private async performDeleteUser(user: User) {
    const loading = await this.loadingController.create({
      message: 'Deleting user...'
    });
    await loading.present();

    try {
      await this.firestore.collection('users').doc(user.user_id).delete();
      this.showToast(`User ${user.first_name} ${user.last_name} deleted successfully`);
      // No need to manually remove from the array as Firestore subscription will update the list
    } catch (error) {
      console.error('Error deleting user:', error);
      this.showToast('Error deleting user. Please try again.');
    } finally {
      await loading.dismiss();
    }
  }

  async logout() {
    try {
      await this.auth.signOut();
      this.router.navigate(['/']);
    } catch (error) {
      this.showToast('Unable to log out. Please try again.');
    }
  }
}