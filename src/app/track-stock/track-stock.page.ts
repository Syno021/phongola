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
  previousStock: number;
  new_stock: number;
  updatedBy: string;
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

interface ProductHistoryData {
  category: string;
  created_at: any;
  description: string;
  image_url: string;
  low_stock_threshold: number;
  name: string;
  price: number;
  product_id: number;
  stock_history: Array<{
    current_stock: number;
    date: any;
    new_stock: number;
    previous_stock: number;
    updated_by: string;
  }>;
  stock_quantity: number;
  updated_at: any;
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
    this.loadProductsAndHistory();
  }

  async loadProductsAndHistory() {
    try {
      this.loading = true;
      
      // Load products from product_history collection
      const productsSnapshot = await this.ngZone.run(() =>
        runInInjectionContext(this.injector, () =>
          this.firestore.collection('products_history').get().toPromise()
        )
      );
      
      if (productsSnapshot) {
        this.products = productsSnapshot.docs.map(doc => {
          const data = doc.data() as ProductHistoryData;
          
          // Process the product with its stock history
          const productWithHistory = this.processProductHistory(doc.id, data);
          
          return productWithHistory;
        });
      }
    } catch (error) {
      console.error('Error loading data:', error);
      this.error = true;
      this.showToast('Unable to load product history. Please try again');
    } finally {
      this.loading = false;
    }
  }

  private processProductHistory(id: string, data: ProductHistoryData): ProductWithHistory {
    // Process stock history from the product document
    const stockHistoryEntries: StockHistory[] = [];
    
    if (data.stock_history && data.stock_history.length > 0) {
      data.stock_history.forEach(entry => {
        const entryDate = entry.date instanceof Date ? 
          entry.date : 
          entry.date.toDate();
          
        stockHistoryEntries.push({
          date: entryDate,
          quantity: entry.current_stock,
          previousStock: entry.previous_stock,
          new_stock: entry.new_stock,
          updatedBy: entry.updated_by
        });
      });
    } else {
      // If no stock history, create initial entry from creation date
      const createdDate = data.created_at instanceof Date ? 
        data.created_at : 
        data.created_at.toDate();
        
      stockHistoryEntries.push({
        date: createdDate,
        quantity: data.stock_quantity,
        previousStock: 0,
        new_stock: data.stock_quantity,
        updatedBy: 'System'
      });
    }
    
    // Sort entries by date
    stockHistoryEntries.sort((a, b) => a.date.getTime() - b.date.getTime());
    
    // Organize entries by year and month
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
    
    // Group stock history by year and month
    const entriesByYearMonth = new Map<string, StockHistory[]>();
    
    stockHistoryEntries.forEach(entry => {
      const year = entry.date.getFullYear();
      const month = entry.date.getMonth();
      const key = `${year}-${month}`;
      
      if (!entriesByYearMonth.has(key)) {
        entriesByYearMonth.set(key, []);
      }
      
      entriesByYearMonth.get(key)?.push(entry);
    });
    
    // Build the year-month hierarchy
    const now = new Date();
    const earliestDate = stockHistoryEntries.length > 0 ? 
      stockHistoryEntries[0].date : 
      (data.created_at instanceof Date ? data.created_at : data.created_at.toDate());
    const startYear = earliestDate.getFullYear();
    
    for (let year = startYear; year <= now.getFullYear(); year++) {
      const months = [];
      
      // Limit months in the first year to start from creation month
      const startMonth = year === startYear ? earliestDate.getMonth() : 0;
      
      // Limit months in the current year to current month
      const endMonth = year === now.getFullYear() ? now.getMonth() : 11;
      
      for (let month = startMonth; month <= endMonth; month++) {
        const key = `${year}-${month}`;
        const stockData = entriesByYearMonth.get(key) || [];
        
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
      name: data.name,
      currentStock: data.stock_quantity,
      category: data.category,
      price: data.price,
      lowStockThreshold: data.low_stock_threshold,
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