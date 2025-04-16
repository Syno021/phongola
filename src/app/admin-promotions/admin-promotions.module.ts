import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { AdminPromotionsPageRoutingModule } from './admin-promotions-routing.module';
import { AdminPromotionsPage } from './admin-promotions.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    IonicModule,
    AdminPromotionsPageRoutingModule
  ],
  declarations: [AdminPromotionsPage]
})
export class AdminPromotionsPageModule {}