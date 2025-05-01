export enum ProductCategory {
  LIQUIDS = 'liquids',
  CLEANING_DETERGENTS = 'cleaning-detergents',
  POWDER = 'powder',
  LAUNDRY = 'laundry',
  DISHWASHING = 'dishwashing',
  SURFACE_CLEANING = 'surface-cleaning',
  AIR_FRESHENERS = 'air-fresheners',
  FLOOR_CLEANING = 'floor-cleaning',
  TOILET_AND_BATHROOM = 'toilet-bathroom',
  WINDOW_GLASS = 'window-glass',
  WASTER_AND_BIN = 'waster-bin',
}

export interface Product {
    product_id: any;
    name: string;
    description: string;
    price: number;
    stock_quantity: number;
    category: ProductCategory;
    promotion_id?:number;
    image_url: string;
    created_at: Date;
    updated_at: Date;
    low_stock_threshold?: number;
  }