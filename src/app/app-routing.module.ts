import { NgModule } from '@angular/core';
import { PreloadAllModules, RouterModule, Routes } from '@angular/router';
import { AdminAuthGuard } from './shared/services/AdminAuthGuard';

const routes: Routes = [
  {
    path: 'home',
    loadChildren: () => import('./home/home.module').then(m => m.HomePageModule)
  },
  {
    path: '',
    redirectTo: 'home',
    pathMatch: 'full'
  },
  {
    path: 'register',
    loadChildren: () => import('./register/register.module').then(m => m.RegisterPageModule)
  },
  {
    path: 'admin-inventory',
    loadChildren: () => import('./admin-inventory/admin-inventory.module').then(m => m.AdminInventoryPageModule),
    canActivate: [AdminAuthGuard]
  },
  {
    path: 'admin-promotions',
    loadChildren: () => import('./admin-promotions/admin-promotions.module').then(m => m.AdminPromotionsPageModule),
    canActivate: [AdminAuthGuard]
  },
  {
    path: 'cart',
    loadChildren: () => import('./cart/cart.module').then(m => m.CartPageModule)
  },
  {
    path: 'pos',
    loadChildren: () => import('./pos/pos.module').then( m => m.PosPageModule),
    canActivate: [AdminAuthGuard]
  },
  {
    path: 'stats',
    loadChildren: () => import('./stats/stats.module').then( m => m.StatsPageModule),
    canActivate: [AdminAuthGuard]
  },
  {
    path: 'order-management',
    loadChildren: () => import('./order-management/order-management.module').then( m => m.OrderManagementPageModule),
    canActivate: [AdminAuthGuard]
  },
  {
    path: 'profile',
    loadChildren: () => import('./profile/profile.module').then( m => m.ProfilePageModule)
  },
  {
    path: 'forgot-password',
    loadChildren: () => import('./forgot-password/forgot-password.module').then( m => m.ForgotPasswordPageModule)
  },
  {
    path: 'admin-users',
    loadChildren: () => import('./admin-users/admin-users.module').then( m => m.AdminUsersPageModule),
    canActivate: [AdminAuthGuard]
  },  {
    path: 'track-stock',
    loadChildren: () => import('./track-stock/track-stock.module').then( m => m.TrackStockPageModule)
  }



];

@NgModule({
  imports: [
    RouterModule.forRoot(routes, { preloadingStrategy: PreloadAllModules })
  ],
  exports: [RouterModule]
})
export class AppRoutingModule { }
