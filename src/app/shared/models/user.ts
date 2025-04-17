// Enums
export enum UserRole {
    ADMIN = 'ADMIN',
    CUSTOMER = 'CUSTOMER',
    CASHIER = 'CASHIER',
    MANAGER = 'MANAGER'
  }

  export interface User {
    user_id: any;
    username: string;
    email: string;
    password_hash: string;
    first_name: string;
    last_name: string;
    role: UserRole;
    created_at: Date;
    updated_at: Date;
  }

  
  
  
  
  
  
  
  