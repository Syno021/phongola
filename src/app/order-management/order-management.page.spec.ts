import { ComponentFixture, TestBed } from '@angular/core/testing';
import { OrderManagementPage } from './order-management.page';

describe('OrderManagementPage', () => {
  let component: OrderManagementPage;
  let fixture: ComponentFixture<OrderManagementPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(OrderManagementPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
