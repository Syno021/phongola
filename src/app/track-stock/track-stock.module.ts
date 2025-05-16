import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { TrackStockPageRoutingModule } from './track-stock-routing.module';

import { TrackStockPage } from './track-stock.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    TrackStockPageRoutingModule
  ],
  declarations: [TrackStockPage]
})
export class TrackStockPageModule {}
