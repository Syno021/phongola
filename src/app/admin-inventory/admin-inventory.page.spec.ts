import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AdminInventoryPage } from './admin-inventory.page';

describe('AdminInventoryPage', () => {
  let component: AdminInventoryPage;
  let fixture: ComponentFixture<AdminInventoryPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(AdminInventoryPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
