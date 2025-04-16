// models/sale.ts
export enum PaymentMethod {
    CASH = 'CASH',
    ONLINE = 'ONLINE',
    CARD = 'CARD'
  }
  
  export interface Sale {
    sale_id: string;
    total_amount: number;
    payment_method: PaymentMethod;
    sale_date: Date;
    payment_reference?: string;  // Added for tracking payment
    subtotal?: number;           // Added for detailed pricing
    tax?: number;                // Added for detailed pricing
    user_id?: string;            // Added for user tracking
    user_email?: string;         // Added for user tracking
  }