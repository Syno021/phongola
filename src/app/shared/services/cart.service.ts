import { Injectable, Component, OnInit, Injector, NgZone, runInInjectionContext } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { Product } from '../models/product';
import { AngularFirestore, AngularFirestoreDocument } from '@angular/fire/compat/firestore';
import { AngularFireAuth } from '@angular/fire/compat/auth';
import { map, take } from 'rxjs/operators';
import firebase from 'firebase/compat/app';
import { Sale, PaymentMethod } from '../models/sale';

interface ProductData {
  stock_quantity: number;
  [key: string]: any;
}

@Injectable({
  providedIn: 'root'
})
export class CartService {
  private readonly CART_KEY = 'shopping_cart';
  private cartItemsSubject = new BehaviorSubject<Map<string, number>>(new Map());
  cartItems$ = this.cartItemsSubject.asObservable();
  
  constructor(
    private firestore: AngularFirestore,
    private auth: AngularFireAuth,
    private ngZone: NgZone,
    private injector: Injector
  ) {
    this.loadCart();
  }

  private loadCart() {
    const savedCart = localStorage.getItem(this.CART_KEY);
    if (savedCart) {
      const cartObject = JSON.parse(savedCart);
      const cartMap = new Map<string, number>(
        Object.entries(cartObject).map(([key, value]) => [key, value as number])
      );
      this.cartItemsSubject.next(cartMap);
    }
  }

  private saveCart(cartMap: Map<string, number>) {
    const cartObject: { [key: string]: number } = {};
    cartMap.forEach((value, key) => {
      cartObject[key] = value;
    });
    localStorage.setItem(this.CART_KEY, JSON.stringify(cartObject));
    this.cartItemsSubject.next(cartMap);
  }

  async addToCart(product: Product, quantityToAdd: number) {
  if (quantityToAdd <= 0) return; // Don't add zero or negative quantities
  
  const currentCart = new Map(this.cartItemsSubject.value);
  const currentQtyInCart = currentCart.get(product.product_id) || 0;
  const totalQtyWouldBe = currentQtyInCart + quantityToAdd;
  
  // Check if total quantity would exceed stock
  if (totalQtyWouldBe > product.stock_quantity) {
    const availableToAdd = product.stock_quantity - currentQtyInCart;
    if (availableToAdd > 0) {
      // Add only what's available
      currentCart.set(product.product_id, product.stock_quantity);
      this.saveCart(currentCart);
      throw new Error(`Only ${availableToAdd} more items could be added. You now have ${product.stock_quantity} in your cart.`);
    } else {
      throw new Error(`Cannot add more items. You already have the maximum quantity (${product.stock_quantity}) in your cart.`);
    }
  }
  
  currentCart.set(product.product_id, totalQtyWouldBe);
  this.saveCart(currentCart);
}

  async updateQuantity(productId: string, newQuantity: number, maxStock?: number) {
  const currentCart = new Map(this.cartItemsSubject.value);
  
  if (newQuantity <= 0) {
    currentCart.delete(productId); // Remove if quantity is zero or negative
  } else {
    // If maxStock is provided, check against it
    if (maxStock && newQuantity > maxStock) {
      throw new Error(`Cannot set quantity to ${newQuantity}. Maximum available stock is ${maxStock}.`);
    }
    currentCart.set(productId, newQuantity);
  }
  this.saveCart(currentCart);
}

  removeFromCart(productId: string) {
    const currentCart = new Map(this.cartItemsSubject.value);
    currentCart.delete(productId);
    this.saveCart(currentCart);
  }

  getQuantity(productId: string): number {
    return this.cartItemsSubject.value.get(productId) || 0;
  }

  getTotalItems(): number {
    return Array.from(this.cartItemsSubject.value.values())
      .reduce((sum, stock_quantity) => sum + stock_quantity, 0);
  }

  clearCart() {
    this.saveCart(new Map<string, number>());
  }

  // Check if user is logged in
  isLoggedIn() {
    return this.auth.authState.pipe(
      map(user => !!user)
    );
  }

  // Get current user
  async getCurrentUser() {
    return this.ngZone.run(() => {
      return runInInjectionContext(this.injector, async () => {
        return this.auth.currentUser;
      });
    });
  }

  // Process checkout
  async checkout(cartItems: any[]) {
    return this.ngZone.run(() => {
      return runInInjectionContext(this.injector, async () => {
        const user = await this.auth.currentUser;
        
        if (!user) {
          throw new Error('User must be logged in to checkout');
        }

        const batch = this.firestore.firestore.batch();
        
        // Get payment reference from the first cart item (all items have same reference)
        const paymentReference = cartItems[0]?.payment_reference || null;
        
        // Create cart document with user information
        const cartDocRef = await this.ngZone.run(() => {
          return runInInjectionContext(this.injector, async () => {
            return this.firestore.collection('cart').doc();
          });
        });
        const cartId = cartDocRef.ref.id; // Get the ID from the reference
        
        const cartData = {
          user_id: user.uid,
          user_email: user.email,
          created_at: firebase.firestore.FieldValue.serverTimestamp(),
          items: cartItems.map(item => ({
            product_id: item.product_id,
            name: item.name,
            price: item.price,
            quantity: item.quantity
          })),
          status: 'completed',
          payment_reference: paymentReference
        };
        
        batch.set(cartDocRef.ref, cartData);
        
        // Calculate the actual total from cart items
        const totalAmount = cartItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        const taxAmount = totalAmount * 0.15;
        const grandTotal = totalAmount + taxAmount;
        
        // Create sale document using Sale interface
        const saleDocRef = await this.ngZone.run(() => {
          return runInInjectionContext(this.injector, async () => {
            return this.firestore.collection('sales').doc();
          });
        });
        const saleId = saleDocRef.ref.id; // Get the ID from the reference
        
        const userEmail = user.email || 'unknown@example.com'; // Fallback in case email is null or undefined
        const saleData: Sale = {
          sale_id: saleId,
          total_amount: grandTotal,
          payment_method: PaymentMethod.ONLINE,
          sale_date: new Date(),
          payment_reference: paymentReference,
          subtotal: totalAmount,
          tax: taxAmount,
          user_id: user.uid,
          user_email: userEmail
        };
        
        batch.set(saleDocRef.ref, saleData);
        
        // Update product quantities
        const productUpdates = [];
        
        for (const item of cartItems) {
          const productRef = await this.ngZone.run(() => {
            return runInInjectionContext(this.injector, async () => {
              return this.firestore.collection('products').doc(item.product_id).ref;
            });
          });
          
          // Get current product data to check quantity
          const productDoc = await productRef.get();
          if (!productDoc.exists) {
            throw new Error(`Product ${item.product_id} not found`);
          }
          
          const productData = productDoc.data() as ProductData;
          if (!productData) {
            throw new Error(`Product data for ${item.product_id} is null`);
          }
          
          const currentStock = productData.stock_quantity || 0;
          if (currentStock < item.quantity) {
            throw new Error(`Not enough stock for product ${item.name}. Available: ${currentStock}`);
          }
          
          // Update product quantity
          batch.update(productRef, {
            stock_quantity: firebase.firestore.FieldValue.increment(-item.quantity)
          });
          
          productUpdates.push({
            product_id: item.product_id,
            old_quantity: currentStock,
            new_quantity: currentStock - item.quantity,
            quantity_decreased: item.quantity,
          });
        }
        
        // Store the inventory updates for audit
        const inventoryUpdateRef = await this.ngZone.run(() => {
          return runInInjectionContext(this.injector, async () => {
            return this.firestore.collection('inventory_Transactions').doc();
          });
        });
        
        batch.set(inventoryUpdateRef.ref, {
          sale_id: saleId,
          payment_reference: paymentReference,
          updates: productUpdates,
          updated_at: firebase.firestore.FieldValue.serverTimestamp(),
          updated_by: user.uid
        });
        
        // Execute all operations as a batch
        await batch.commit();
        
        // Clear the local cart after successful checkout
        this.clearCart();
        
        return {
          success: true,
          cart_id: cartId, 
          sale_id: saleId,
          sale_data: saleData
        };
      });
    });
  }
}