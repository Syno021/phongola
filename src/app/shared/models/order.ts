export interface Order {
    order_id: number;
    user_id: number;
    total_amount: number;
    status: OrderStatus;
    created_at: Date;
    updated_at: Date;
  }

  enum OrderStatus {
    PENDING = 'PENDING',
    PROCESSING = 'PROCESSING',
    SHIPPED = 'SHIPPED',
    DELIVERED = 'DELIVERED',
    CANCELLED = 'CANCELLED'
  }