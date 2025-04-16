export interface Sale {
    sale_id: any;
    total_amount: any;
    payment_method: PaymentMethod;
    sale_date: Date;
}

export enum PaymentMethod {
    CASH = 'CASH',
    CREDIT_CARD = 'CREDIT_CARD',
    DEBIT_CARD = 'DEBIT_CARD',
    GIFT_CARD = 'GIFT_CARD',
    ONLINE = 'ONLINE'
}