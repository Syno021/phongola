import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { AdminInventoryPage } from './admin-inventory.page';

const routes: Routes = [
  {
    path: '',
    component: AdminInventoryPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class AdminInventoryPageRoutingModule {}
