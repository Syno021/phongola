import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { TrackStockPage } from './track-stock.page';

const routes: Routes = [
  {
    path: '',
    component: TrackStockPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class TrackStockPageRoutingModule {}
