import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';
import { AdminPromotionsPage } from './admin-promotions.page';

const routes: Routes = [
  {
    path: '',
    component: AdminPromotionsPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class AdminPromotionsPageRoutingModule {}