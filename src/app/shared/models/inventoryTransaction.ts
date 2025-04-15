enum TransactionType {
    PURCHASE = 'PURCHASE',
    SALE = 'SALE',
    ADJUSTMENT = 'ADJUSTMENT',
    RETURN = 'RETURN'
  }

  export interface InventoryTransaction {
    transaction_id: number;
    product_id: number;
    quantity_change: number;
    transaction_type: TransactionType;
    transaction_date: Date;
    user_id: number;
  }