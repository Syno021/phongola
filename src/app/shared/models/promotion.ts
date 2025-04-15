export interface Promotion {
    promotion_id: number;
    name: string;
    description: string;
    discount_percentage: number;
    start_date: Date;
    end_date: Date;
    created_at: Date;
    updated_at: Date;
  }