export enum ProductCategory {
  LIQUIDS = 'liquids',
  CLEANING_DETERGENTS = 'cleaning-detergents',
  POWDER = 'powder'
}

export interface Product {
    product_id: any;
    name: string;
    description: string;
    price: number;
    stock_quantity: number;
    category: ProductCategory;
    image_url: string;
    created_at: Date;
    updated_at: Date;
  }