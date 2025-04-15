export interface Sale {
    sale_id: number;
    order_id: number;
    cashier_id: number;
    total_amount: number;
    payment_method: PaymentMethod;
    sale_date: Date;
  }

  enum PaymentMethod {
    CASH = 'CASH',
    CREDIT_CARD = 'CREDIT_CARD',
    DEBIT_CARD = 'DEBIT_CARD',
    GIFT_CARD = 'GIFT_CARD',
    ONLINE = 'ONLINE'
  }