import { Component, Input, OnInit } from '@angular/core';
import { ModalController } from '@ionic/angular';

@Component({
  selector: 'app-order-details-modal',
  templateUrl: './order-details-modal.component.html',
  styleUrls: ['./order-details-modal.component.scss'],
  standalone: false
})
export class OrderDetailsModalComponent  implements OnInit {
  @Input() order: any;

  constructor(
    private modalCtrl: ModalController
  ) { }

  ngOnInit() {}

  dismissModal() {
    this.modalCtrl.dismiss();
  }

  formatDate(timestamp: any): string {
    if (!timestamp) return 'N/A';
    return new Date(timestamp.seconds * 1000).toLocaleString();
  }

  calculateSubtotal(): number {
    if (!this.order.items || this.order.items.length === 0) return 0;
    return this.order.items.reduce((sum: number, item: any) => sum + (item.price * item.quantity), 0);
  }
}