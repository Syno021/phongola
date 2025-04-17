export interface Order {
    order_id: any;
    user_id: any;
    total_amount: any;
    status: OrderStatus;
    created_at: any;
    updated_at: Date;
  }

  enum OrderStatus {
    PENDING = 'PENDING',
    PROCESSING = 'PROCESSING',
    SHIPPED = 'SHIPPED',
    DELIVERED = 'DELIVERED',
    CANCELLED = 'CANCELLED'
  }