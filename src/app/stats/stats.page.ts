import { Component, OnInit, Injector, NgZone, ElementRef, ViewChild } from '@angular/core';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { runInInjectionContext } from '@angular/core';
import { Sale, PaymentMethod } from '../shared/models/sale';
import { Product, ProductCategory } from '../shared/models/product';
import { Order } from '../shared/models/order';
import { Promotion } from '../shared/models/promotion';
import * as d3 from 'd3';
import { Chart, registerables } from 'chart.js';

Chart.register(...registerables);

@Component({
  selector: 'app-stats',
  templateUrl: './stats.page.html',
  styleUrls: ['./stats.page.scss'],
  standalone: false,
})
export class StatsPage implements OnInit {
  @ViewChild('salesChart') salesChartRef!: ElementRef;
  @ViewChild('categoryPieChart') categoryPieChartRef!: ElementRef;
  @ViewChild('paymentMethodsChart') paymentMethodsChartRef!: ElementRef;
  @ViewChild('productTrendsChart') productTrendsChartRef!: ElementRef;
  @ViewChild('promotionPerformanceChart') promotionPerformanceChartRef!: ElementRef;
  @ViewChild('dailyProductsChart') dailyProductsChartRef!: ElementRef;

  private salesData: Sale[] = [];
  private productsData: Product[] = [];
  private ordersData: Order[] = [];
  private promotionsData: Promotion[] = [];
  
  totalRevenue: number = 0;
  totalOrders: number = 0;
  averageOrderValue: number = 0;
  topProducts: Array<{ name: string; total: number }> = [];
  
  // New analytics properties
  dateFilter: 'week' | 'month' | 'year' = 'month';
  promotionalSalesTotal: number = 0;
  regularSalesTotal: number = 0;
  productAdditionsByDate: Map<string, number> = new Map();
  activePromotions: number = 0;
  bestPerformingPromotion: { name: string; revenue: number } = { name: '', revenue: 0 };
  averagePromotionalDiscount: number = 0;
  
  // Trending metrics
  salesGrowthRate: number = 0;
  topGrowingCategories: Array<{ category: string; growth: number }> = [];
  
  constructor(
    private firestore: AngularFirestore,
    private ngZone: NgZone,
    private injector: Injector
  ) {}

  ngOnInit() {
    this.loadData();
  }

  private async loadData() {
    try {
      await this.ngZone.run(() =>
        runInInjectionContext(this.injector, async () => {
          const [salesSnapshot, productsSnapshot, ordersSnapshot, promotionsSnapshot] = await Promise.all([
            this.firestore.collection('sales').get().toPromise(),
            this.firestore.collection('products').get().toPromise(),
            this.firestore.collection('orders').get().toPromise(),
            this.firestore.collection('promotions').get().toPromise()
          ]);

          // Process sales data
          this.salesData = salesSnapshot?.docs.map(doc => {
            const data = doc.data() as Record<string, any>;
            return {
              sale_id: doc.id,
              total_amount: data['total_amount'] || 0,
              payment_method: data['payment_method'] as PaymentMethod,
              sale_date: data['sale_date']?.toDate() || new Date(),
              payment_reference: data['payment_reference'],
              subtotal: data['subtotal'],
              tax: data['tax'],
              user_id: data['user_id'],
              user_email: data['user_email']
            } as Sale;
          }) || [];

          // Process products data
          this.productsData = productsSnapshot?.docs.map(doc => {
            const data = doc.data() as Record<string, any>;
            return {
              product_id: doc.id,
              name: data['name'] || '',
              description: data['description'] || '',
              price: data['price'] || 0,
              stock_quantity: data['stock_quantity'] || 0,
              category: data['category'] as ProductCategory,
              promotion_id: data['promotion_id'],
              image_url: data['image_url'] || '',
              created_at: data['created_at']?.toDate() || new Date(),
              updated_at: data['updated_at']?.toDate() || new Date()
            } as Product;
          }) || [];

          // Process orders data
          this.ordersData = ordersSnapshot?.docs.map(doc => {
            const data = doc.data() as Record<string, any>;
            return {
              order_id: doc.id,
              user_id: data['user_id'],
              total_amount: data['total_amount'] || 0,
              status: data['status'],
              created_at: data['created_at']?.toDate() || new Date(),
              updated_at: data['updated_at']?.toDate() || new Date()
            } as Order;
          }) || [];

          // Process promotions data
          this.promotionsData = promotionsSnapshot?.docs.map(doc => {
            const data = doc.data() as Record<string, any>;
            return {
              promotion_id: parseInt(doc.id),
              name: data['name'],
              description: data['description'],
              discount_percentage: data['discount_percentage'],
              start_date: data['start_date']?.toDate() || new Date(),
              end_date: data['end_date']?.toDate() || new Date(),
              created_at: data['created_at']?.toDate() || new Date(),
              updated_at: data['updated_at']?.toDate() || new Date()
            } as Promotion;
          }) || [];

          this.calculateMetrics();
          this.calculateAdvancedMetrics();
          this.renderCharts();
        })
      );
    } catch (error) {
      console.error('Error loading data:', error);
    }
  }

  private calculateMetrics() {
    // Calculate metrics synchronously since data is already loaded
    this.totalRevenue = this.salesData.reduce((sum, sale) => sum + sale.total_amount, 0);
    this.totalOrders = this.salesData.length;
    this.averageOrderValue = this.totalRevenue / this.totalOrders || 0;

    const productSales = new Map<string, number>();
    this.salesData.forEach(sale => {
      const product = this.productsData.find(p => p.product_id === sale.sale_id);
      if (product) {
        const current = productSales.get(product.name) || 0;
        productSales.set(product.name, current + sale.total_amount);
      }
    });

    this.topProducts = Array.from(productSales.entries())
      .map(([name, total]) => ({ name, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);
  }

  private calculateAdvancedMetrics() {
    // Calculate promotional sales metrics
    const now = new Date();
    this.activePromotions = this.promotionsData.filter(p => 
      p.start_date <= now && p.end_date >= now
    ).length;

    // Calculate sales with promotions vs without
    this.salesData.forEach(sale => {
      const product = this.productsData.find(p => p.product_id === sale.sale_id);
      if (product?.promotion_id) {
        this.promotionalSalesTotal += sale.total_amount;
      } else {
        this.regularSalesTotal += sale.total_amount;
      }
    });

    // Calculate product additions by date
    this.productsData.forEach(product => {
      const dateKey = product.created_at.toISOString().split('T')[0];
      this.productAdditionsByDate.set(
        dateKey,
        (this.productAdditionsByDate.get(dateKey) || 0) + 1
      );
    });

    // Calculate best performing promotion
    this.promotionsData.forEach(promotion => {
      const promotionalSales = this.salesData.filter(sale => {
        const product = this.productsData.find(p => p.product_id === sale.sale_id);
        return product?.promotion_id === promotion.promotion_id;
      });
      
      const revenue = promotionalSales.reduce((sum, sale) => sum + sale.total_amount, 0);
      if (revenue > this.bestPerformingPromotion.revenue) {
        this.bestPerformingPromotion = { name: promotion.name, revenue };
      }
    });

    // Calculate growth metrics
    this.calculateGrowthMetrics();
  }

  private calculateGrowthMetrics() {
    const sortedSales = [...this.salesData].sort((a, b) => 
      a.sale_date.getTime() - b.sale_date.getTime()
    );

    if (sortedSales.length > 1) {
      const midPoint = Math.floor(sortedSales.length / 2);
      const firstHalf = sortedSales.slice(0, midPoint);
      const secondHalf = sortedSales.slice(midPoint);

      const firstHalfTotal = firstHalf.reduce((sum, sale) => sum + sale.total_amount, 0);
      const secondHalfTotal = secondHalf.reduce((sum, sale) => sum + sale.total_amount, 0);

      this.salesGrowthRate = ((secondHalfTotal - firstHalfTotal) / firstHalfTotal) * 100;
    }

    // Calculate category growth
    const categoryGrowth = new Map<string, { early: number; late: number }>();
    this.productsData.forEach(product => {
      if (!categoryGrowth.has(product.category)) {
        categoryGrowth.set(product.category, { early: 0, late: 0 });
      }
    });

    this.salesData.forEach(sale => {
      const product = this.productsData.find(p => p.product_id === sale.sale_id);
      if (product) {
        const isLate = sale.sale_date.getTime() > Date.now() - (30 * 24 * 60 * 60 * 1000);
        const data = categoryGrowth.get(product.category);
        if (data) {
          if (isLate) {
            data.late += sale.total_amount;
          } else {
            data.early += sale.total_amount;
          }
        }
      }
    });

    this.topGrowingCategories = Array.from(categoryGrowth.entries())
      .map(([category, { early, late }]) => ({
        category,
        growth: early === 0 ? 0 : ((late - early) / early) * 100
      }))
      .sort((a, b) => b.growth - a.growth)
      .slice(0, 5);
  }

  private renderCharts() {
    // Clear existing charts if they exist
    if (this.salesChartRef?.nativeElement) {
      const canvas = this.salesChartRef.nativeElement;
      const existingChart = Chart.getChart(canvas);
      if (existingChart) {
        existingChart.destroy();
      }
    }

    if (this.categoryPieChartRef?.nativeElement) {
      d3.select(this.categoryPieChartRef.nativeElement).selectAll('*').remove();
    }

    if (this.paymentMethodsChartRef?.nativeElement) {
      const canvas = this.paymentMethodsChartRef.nativeElement;
      const existingChart = Chart.getChart(canvas);
      if (existingChart) {
        existingChart.destroy();
      }
    }

    this.renderSalesChart();
    this.renderCategoryDistribution();
    this.renderPaymentMethodsChart();
    this.renderProductTrendsChart();
    this.renderPromotionPerformanceChart();
    this.renderDailyProductsChart();
  }

  private renderSalesChart() {
    // Group sales by date
    const salesByDate = d3.group(this.salesData, d => 
      new Date(d.sale_date).toISOString().split('T')[0]
    );

    const data = Array.from(salesByDate, ([date, sales]) => ({
      date: new Date(date),
      total: sales.reduce((sum, sale) => sum + sale.total_amount, 0)
    })).sort((a, b) => a.date.getTime() - b.date.getTime());

    new Chart(this.salesChartRef.nativeElement, {
      type: 'line',
      data: {
        labels: data.map(d => d.date.toLocaleDateString()),
        datasets: [{
          label: 'Daily Sales',
          data: data.map(d => d.total),
          borderColor: '#3880ff',
          tension: 0.1
        }]
      },
      options: {
        responsive: true,
        scales: {
          y: {
            beginAtZero: true,
            title: {
              display: true,
              text: 'Revenue (R)'
            }
          }
        }
      }
    });
  }

  private renderCategoryDistribution() {
    const categoryData = Object.values(ProductCategory).map(category => ({
      category,
      count: this.productsData.filter(p => p.category === category).length
    }));

    const width = 300;
    const height = 300;
    const radius = Math.min(width, height) / 2;

    const color = d3.scaleOrdinal(d3.schemeCategory10);

    const svg = d3.select(this.categoryPieChartRef.nativeElement)
      .append('svg')
      .attr('width', width)
      .attr('height', height)
      .append('g')
      .attr('transform', `translate(${width / 2},${height / 2})`);

    const pie = d3.pie<any>()
      .value((d: any) => d.count);

    const arc = d3.arc()
      .innerRadius(0)
      .outerRadius(radius);

    const arcs = svg.selectAll('arc')
      .data(pie(categoryData))
      .enter()
      .append('g');

    arcs.append('path')
      .attr('d', arc as any)
      .attr('fill', (d: any, i: number) => color(i.toString()));

    arcs.append('text')
      .attr('transform', (d: any) => `translate(${arc.centroid(d)})`)
      .attr('text-anchor', 'middle')
      .text((d: any) => d.data.category);
  }

  private renderPaymentMethodsChart() {
    const paymentData = Object.values(PaymentMethod).map(method => ({
      method,
      count: this.salesData.filter(s => s.payment_method === method).length
    }));

    new Chart(this.paymentMethodsChartRef.nativeElement, {
      type: 'bar',
      data: {
        labels: paymentData.map(d => d.method),
        datasets: [{
          label: 'Payment Methods',
          data: paymentData.map(d => d.count),
          backgroundColor: [
            'rgba(255, 99, 132, 0.5)',
            'rgba(54, 162, 235, 0.5)',
            'rgba(255, 206, 86, 0.5)'
          ]
        }]
      },
      options: {
        responsive: true,
        scales: {
          y: {
            beginAtZero: true,
            title: {
              display: true,
              text: 'Number of Transactions'
            }
          }
        }
      }
    });
  }

  private renderProductTrendsChart() {
    if (this.productTrendsChartRef?.nativeElement) {
      const canvas = this.productTrendsChartRef.nativeElement;
      const existingChart = Chart.getChart(canvas);
      if (existingChart) {
        existingChart.destroy();
      }

      const productAdditions = Array.from(this.productAdditionsByDate.entries())
        .map(([date, count]) => ({ date: new Date(date), count }))
        .sort((a, b) => a.date.getTime() - b.date.getTime());

      new Chart(canvas, {
        type: 'line',
        data: {
          labels: productAdditions.map(d => d.date.toLocaleDateString()),
          datasets: [{
            label: 'New Products Added',
            data: productAdditions.map(d => d.count),
            borderColor: '#4CAF50',
            tension: 0.1
          }]
        },
        options: {
          responsive: true,
          scales: {
            y: {
              beginAtZero: true,
              title: {
                display: true,
                text: 'Number of Products'
              }
            }
          }
        }
      });
    }
  }

  private renderPromotionPerformanceChart() {
    if (this.promotionPerformanceChartRef?.nativeElement) {
      const canvas = this.promotionPerformanceChartRef.nativeElement;
      const existingChart = Chart.getChart(canvas);
      if (existingChart) {
        existingChart.destroy();
      }

      const promotionPerformance = this.promotionsData.map(promotion => {
        const sales = this.salesData.filter(sale => {
          const product = this.productsData.find(p => p.product_id === sale.sale_id);
          return product?.promotion_id === promotion.promotion_id;
        });
        return {
          name: promotion.name,
          revenue: sales.reduce((sum, sale) => sum + sale.total_amount, 0)
        };
      });

      new Chart(canvas, {
        type: 'bar',
        data: {
          labels: promotionPerformance.map(p => p.name),
          datasets: [{
            label: 'Promotion Revenue',
            data: promotionPerformance.map(p => p.revenue),
            backgroundColor: 'rgba(75, 192, 192, 0.5)',
            borderColor: 'rgba(75, 192, 192, 1)',
            borderWidth: 1
          }]
        },
        options: {
          responsive: true,
          scales: {
            y: {
              beginAtZero: true,
              title: {
                display: true,
                text: 'Revenue (R)'
              }
            }
          }
        }
      });
    }
  }

  private renderDailyProductsChart() {
    if (this.dailyProductsChartRef?.nativeElement) {
      const canvas = this.dailyProductsChartRef.nativeElement;
      const existingChart = Chart.getChart(canvas);
      if (existingChart) {
        existingChart.destroy();
      }

      const dailySales = new Map<string, { regular: number; promotional: number }>();
      
      this.salesData.forEach(sale => {
        const dateKey = sale.sale_date.toISOString().split('T')[0];
        if (!dailySales.has(dateKey)) {
          dailySales.set(dateKey, { regular: 0, promotional: 0 });
        }
        
        const product = this.productsData.find(p => p.product_id === sale.sale_id);
        const data = dailySales.get(dateKey)!;
        
        if (product?.promotion_id) {
          data.promotional += sale.total_amount;
        } else {
          data.regular += sale.total_amount;
        }
      });

      const sortedDates = Array.from(dailySales.entries())
        .sort((a, b) => new Date(a[0]).getTime() - new Date(b[0]).getTime());

      new Chart(canvas, {
        type: 'bar',
        data: {
          labels: sortedDates.map(([date]) => new Date(date).toLocaleDateString()),
          datasets: [
            {
              label: 'Regular Sales',
              data: sortedDates.map(([, data]) => data.regular),
              backgroundColor: 'rgba(54, 162, 235, 0.5)',
              borderColor: 'rgba(54, 162, 235, 1)',
              borderWidth: 1
            },
            {
              label: 'Promotional Sales',
              data: sortedDates.map(([, data]) => data.promotional),
              backgroundColor: 'rgba(255, 99, 132, 0.5)',
              borderColor: 'rgba(255, 99, 132, 1)',
              borderWidth: 1
            }
          ]
        },
        options: {
          responsive: true,
          scales: {
            x: {
              stacked: true
            },
            y: {
              stacked: true,
              title: {
                display: true,
                text: 'Revenue (R)'
              }
            }
          }
        }
      });
    }
  }

  updateDateFilter(event: any) {
    const value = event?.detail?.value;
    if (value && (value === 'week' || value === 'month' || value === 'year')) {
      this.dateFilter = value;
      this.calculateMetrics();
      this.calculateAdvancedMetrics();
      this.renderCharts();
    }
  }
}