import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TrackStockPage } from './track-stock.page';

describe('TrackStockPage', () => {
  let component: TrackStockPage;
  let fixture: ComponentFixture<TrackStockPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(TrackStockPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
