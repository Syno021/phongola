enum TransactionType {
    PURCHASE = 'PURCHASE',
    SALE = 'SALE',
    ADJUSTMENT = 'ADJUSTMENT',
    RETURN = 'RETURN'
  }

  export interface InventoryTransaction {
    transaction_id: any;
    product_id: any;
    quantity_change: number;
    transaction_type: TransactionType;
    transaction_date: Date;
    user_id: number;
  }