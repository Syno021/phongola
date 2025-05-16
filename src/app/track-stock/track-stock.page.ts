import { Component, OnInit, Injector, NgZone } from '@angular/core';
import { Product } from '../shared/models/product';
import { AngularFireAuth } from '@angular/fire/compat/auth';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { Router } from '@angular/router';
import { ToastController } from '@ionic/angular';
import { FormBuilder } from '@angular/forms';
import { runInInjectionContext } from '@angular/core';

interface StockHistory {
  date: Date;
  quantity: number;
  transaction?: string; // Optional reference to the transaction
}

interface ProductWithHistory {
  id: string;
  name: string;
  currentStock: number;
  category: string;
  price: number;
  lowStockThreshold: number;
  expanded: boolean;
  years: {
    year: number;
    expanded: boolean;
    months: {
      month: number;
      monthName: string;
      expanded: boolean;
      stockData: StockHistory[];
    }[];
  }[];
}

interface InventoryTransaction {
  payment_reference: string;
  sale_id: string;
  updated_at: any; // Firestore timestamp
  updated_by: string;
  updates: Array<{
    new_quantity: number;
    old_quantity: number;
    product_id: string;
    quantity_decreased: number;
  }>;
}

@Component({
  selector: 'app-track-stock',
  templateUrl: './track-stock.page.html',
  styleUrls: ['./track-stock.page.scss'],
  standalone: false
})
export class TrackStockPage implements OnInit {
  products: ProductWithHistory[] = [];
  loading = true;
  error = false;
  inventoryTransactions: InventoryTransaction[] = [];

  constructor(
    private auth: AngularFireAuth,
    private firestore: AngularFirestore,
    private router: Router,
    private toastController: ToastController,
    private ngZone: NgZone,
    private formBuilder: FormBuilder,
    private injector: Injector
  ) { }

  ngOnInit() {
    this.loadProductsAndTransactions();
  }

  async loadProductsAndTransactions() {
    try {
      this.loading = true;
      
      // Load products
      const productsSnapshot = await this.ngZone.run(() =>
        runInInjectionContext(this.injector, () =>
          this.firestore.collection('products').get().toPromise()
        )
      );
      
      // Load inventory transactions
      const transactionsSnapshot = await this.ngZone.run(() =>
        runInInjectionContext(this.injector, () =>
          this.firestore.collection('inventory_Transaction', ref => 
            ref.orderBy('updated_at', 'asc')).get().toPromise()
        )
      );
      
      if (productsSnapshot && transactionsSnapshot) {
        // Process transactions first
        this.inventoryTransactions = transactionsSnapshot.docs.map(doc => {
          const data = doc.data() as any;
          return {
            id: doc.id,
            payment_reference: data.payment_reference,
            sale_id: data.sale_id,
            updated_at: data.updated_at,
            updated_by: data.updated_by,
            updates: data.updates || []
          };
        });
        
        // Now process products with actual transaction history
        if (productsSnapshot) {
          this.products = productsSnapshot.docs.map(doc => {
            const data = doc.data() as any;
            
            // Create date from creation timestamp
            const createdDate = data.created_at ? 
              (typeof data.created_at === 'string' ? 
                new Date(data.created_at) : 
                data.created_at.toDate()) : 
              new Date();
            
            // Process actual history data from transactions
            const productWithHistory = this.processProductHistory(
              doc.id,
              data.name,
              data.stock_quantity,
              data.category,
              data.price,
              data.low_stock_threshold,
              createdDate
            );
            
            return productWithHistory;
          });
        }
      }
    } catch (error) {
      console.error('Error loading data:', error);
      this.error = true;
      this.showToast('Unable to load product history. Please try again');
    } finally {
      this.loading = false;
    }
  }

  private processProductHistory(
    id: string, 
    name: string, 
    currentStock: number, 
    category: string,
    price: number,
    lowStockThreshold: number,
    createdDate: Date
  ): ProductWithHistory {
    // Get all transactions related to this product
    const productTransactions: Array<{date: Date, oldQuantity: number, newQuantity: number, reference: string}> = [];
    
    // Collect all transaction updates for this product
    this.inventoryTransactions.forEach(transaction => {
      const updates = transaction.updates.filter(update => update.product_id === id);
      
      if (updates.length > 0) {
        const transactionDate = transaction.updated_at instanceof Date ? 
          transaction.updated_at : 
          transaction.updated_at.toDate();
          
        updates.forEach(update => {
          productTransactions.push({
            date: transactionDate,
            oldQuantity: update.old_quantity,
            newQuantity: update.new_quantity,
            reference: transaction.payment_reference
          });
        });
      }
    });
    
    // Add initial stock point if needed
    if (productTransactions.length === 0 || 
        productTransactions[0].date > createdDate) {
      productTransactions.unshift({
        date: createdDate,
        oldQuantity: currentStock,
        newQuantity: currentStock,
        reference: 'Initial Stock'
      });
    }
    
    // Sort transactions by date
    productTransactions.sort((a, b) => a.date.getTime() - b.date.getTime());
    
    // Now organize transactions by year and month
    const years: {
      year: number;
      expanded: boolean;
      months: {
        month: number;
        monthName: string;
        expanded: boolean;
        stockData: StockHistory[];
      }[];
    }[] = [];
    
    // Group transactions by year and month
    const transactionsByYearMonth = new Map<string, StockHistory[]>();
    
    productTransactions.forEach(transaction => {
      const year = transaction.date.getFullYear();
      const month = transaction.date.getMonth();
      const key = `${year}-${month}`;
      
      if (!transactionsByYearMonth.has(key)) {
        transactionsByYearMonth.set(key, []);
      }
      
      transactionsByYearMonth.get(key)?.push({
        date: transaction.date,
        quantity: transaction.newQuantity,
        transaction: transaction.reference
      });
    });
    
    // Build the year-month hierarchy
    const now = new Date();
    const startYear = createdDate.getFullYear();
    
    for (let year = startYear; year <= now.getFullYear(); year++) {
      const months = [];
      
      // Limit months in the first year to start from creation month
      const startMonth = year === startYear ? createdDate.getMonth() : 0;
      
      // Limit months in the current year to current month
      const endMonth = year === now.getFullYear() ? now.getMonth() : 11;
      
      for (let month = startMonth; month <= endMonth; month++) {
        const key = `${year}-${month}`;
        const stockData = transactionsByYearMonth.get(key) || [];
        
        // Only add months that have data
        if (stockData.length > 0) {
          months.push({
            month,
            monthName: this.getMonthName(month),
            expanded: false,
            stockData
          });
        }
      }
      
      // Only add years that have months with data
      if (months.length > 0) {
        years.push({
          year,
          expanded: false,
          months
        });
      }
    }
    
    return {
      id,
      name,
      currentStock,
      category,
      price,
      lowStockThreshold,
      expanded: false,
      years
    };
  }
  
  private getMonthName(monthIndex: number): string {
    const months = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    return months[monthIndex];
  }
  
  toggleProduct(product: ProductWithHistory) {
    product.expanded = !product.expanded;
    
    // If collapsing product, also collapse all children
    if (!product.expanded) {
      product.years.forEach(year => {
        year.expanded = false;
        year.months.forEach(month => month.expanded = false);
      });
    }
  }
  
  toggleYear(product: ProductWithHistory, year: { year: number, expanded: boolean, months: { month: number, monthName: string, expanded: boolean, stockData: StockHistory[] }[] }) {
    year.expanded = !year.expanded;

    // If collapsing year, also collapse all months
    if (!year.expanded) {
      year.months.forEach(month => month.expanded = false);
    }
  }
  
  toggleMonth(month: any) {
    month.expanded = !month.expanded;
  }

  async showToast(message: string) {
    const toast = await this.toastController.create({
      message,
      duration: 3000,
      position: 'bottom'
    });
    await toast.present();
  }
  
  getStockStatusClass(quantity: number, threshold: number): string {
    if (quantity <= 0) return 'out-of-stock';
    if (quantity <= threshold) return 'low-stock';
    return 'in-stock';
  }
  
  trackById(index: number, item: any): string {
    return item.id || index.toString();
  }
}