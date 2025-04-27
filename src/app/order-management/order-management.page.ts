import { Component, OnInit, Injector, NgZone, OnDestroy } from '@angular/core';
import { runInInjectionContext } from '@angular/core';
import { AngularFireAuth } from '@angular/fire/compat/auth';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { Router } from '@angular/router';
import { ModalController, ToastController, AlertController } from '@ionic/angular';
import { FormBuilder } from '@angular/forms';
import { OrderDetailsModalComponent } from '../order-details-modal/order-details-modal.component';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-order-management',
  templateUrl: './order-management.page.html',
  styleUrls: ['./order-management.page.scss'],
  standalone: false
})
export class OrderManagementPage implements OnInit, OnDestroy {
  orders: any[] = [];
  loading: boolean = true;
  statusOptions: string[] = ['pending', 'processing', 'shipped', 'delivered', 'canceled'];
  pageSize: number = 10;
  currentPage: number = 1;
  totalOrders: number = 0;
  displayedOrders: any[] = [];
  private ordersSubscription: Subscription;

  constructor(
    private modalCtrl: ModalController,
    private auth: AngularFireAuth,
    private firestore: AngularFirestore,
    private router: Router,
    private toastController: ToastController,
    private alertController: AlertController,
    private ngZone: NgZone,
    private formBuilder: FormBuilder,
    private injector: Injector,
  ) { 
    this.ordersSubscription = new Subscription();
  }

  ngOnInit() {
    this.loadOrders();
  }

  ngOnDestroy() {
    if (this.ordersSubscription) {
      this.ordersSubscription.unsubscribe();
    }
  }

  async loadOrders() {
    this.loading = true;
    try {
      // Keep the runInInjectionContext but fix the change detection issue
      runInInjectionContext(this.injector, () => {
        this.ordersSubscription = this.firestore.collection('orders')
          .snapshotChanges()
          .subscribe({
            next: (data) => {
              // Force change detection with ApplicationRef
              this.ngZone.run(() => {
                this.orders = data.map(e => {
                  const data = e.payload.doc.data() as any;
                  const id = e.payload.doc.id;
                  return { id, ...data };
                });
                this.totalOrders = this.orders.length;
                this.updateDisplayedOrders();
                this.loading = false;
              });
            },
            error: (error) => {
              console.error('Error fetching orders', error);
              this.ngZone.run(() => {
                this.loading = false;
                this.presentToast('Error loading orders. Please try again.');
              });
            },
            complete: () => {
              this.ngZone.run(() => {
                this.loading = false;
              });
            }
          });
      });
    } catch (error) {
      console.error('Error in loadOrders:', error);
      this.ngZone.run(() => {
        this.loading = false;
        this.presentToast('Error initializing orders. Please try again.');
      });
    }
  }

  updateDisplayedOrders() {
    const start = (this.currentPage - 1) * this.pageSize;
    const end = start + this.pageSize;
    this.displayedOrders = this.orders.slice(start, end);
  }

  showMore() {
    this.pageSize = 25;
    this.updateDisplayedOrders();
  }

  nextPage() {
    if (this.currentPage * this.pageSize < this.totalOrders) {
      this.currentPage++;
      this.updateDisplayedOrders();
    }
  }

  previousPage() {
    if (this.currentPage > 1) {
      this.currentPage--;
      this.updateDisplayedOrders();
    }
  }

  async viewOrderDetails(order: any) {
    const modal = await this.modalCtrl.create({
      component: OrderDetailsModalComponent,
      componentProps: {
        order: order
      }
    });
    return await modal.present();
  }

  async openStatusUpdate(order: any) {
    const alert = await this.alertController.create({
      header: 'Update Order Status',
      message: `Current status: ${order.status}`,
      inputs: this.statusOptions.map(status => ({
        name: status,
        type: 'radio',
        label: status.charAt(0).toUpperCase() + status.slice(1),
        value: status,
        checked: order.status === status
      })),
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel'
        },
        {
          text: 'Update',
          handler: (selectedStatus) => {
            if (selectedStatus) {
              this.updateOrderStatus(order.id, selectedStatus);
            }
          }
        }
      ]
    });

    await alert.present();
  }

  async updateOrderStatus(orderId: string, newStatus: string) {
    try {
      await runInInjectionContext(this.injector, async () => {
        await this.firestore.collection('orders').doc(orderId).update({
          status: newStatus,
          updated_at: new Date()
        });
      });
      this.presentToast('Order status updated successfully');
    } catch (error) {
      console.error('Error updating order status:', error);
      this.presentToast('Failed to update order status. Please try again.');
    }
  }

  formatDate(timestamp: any): string {
    if (!timestamp) return 'N/A';
    try {
      if (timestamp.seconds) {
        return new Date(timestamp.seconds * 1000).toLocaleString();
      } else if (timestamp instanceof Date) {
        return timestamp.toLocaleString();
      } else {
        return new Date(timestamp).toLocaleString();
      }
    } catch (error) {
      console.error('Error formatting date:', error);
      return 'Invalid Date';
    }
  }
  
  async presentToast(message: string) {
    const toast = await this.toastController.create({
      message,
      duration: 2000,
      position: 'bottom'
    });
    toast.present();
  }

  async logout() {
    try {
      await this.auth.signOut();
      this.router.navigate(['/']);
    } catch (error) {
      this.presentToast('Error logging out');
    }
  }
}