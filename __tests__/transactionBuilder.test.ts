/**
 * __tests__/transactionBuilder.test.ts
 *
 * Tests for all three transaction builder functions.
 */
import { describe, it, expect } from '@jest/globals';

import {
  createPayoutRequestTransaction,
  createResetRequestTransaction,
  createCollectionTransaction,
} from '../utils/transactionBuilder';

import type { Location, Driver } from '../types';

// ── Fixtures ────────────────────────────────────────────────────────────────

function makeLocation(overrides: Partial<Location> = {}): Location {
  return {
    id: 'loc-001',
    name: 'Test Shop',
    machineId: 'MCH-001',
    lastScore: 500,
    area: 'Downtown',
    assignedDriverId: 'drv-001',
    ownerName: 'Owner A',
    shopOwnerPhone: '0711000000',
    ownerPhotoUrl: '',
    machinePhotoUrl: '',
    initialStartupDebt: 0,
    remainingStartupDebt: 0,
    isNewOffice: false,
    coords: { lat: -6.8, lng: 39.3 },
    status: 'active',
    lastRevenueDate: null,
    commissionRate: 15,
    resetLocked: false,
    dividendBalance: 0,
    isSynced: true,
    ...overrides,
  } as unknown as Location;
}

function makeDriver(overrides: Partial<Driver> = {}): Driver {
  return {
    id: 'drv-001',
    name: 'Test Driver',
    username: 'testdriver',
    phone: '0712000000',
    initialDebt: 0,
    remainingDebt: 0,
    dailyFloatingCoins: 100,
    vehicleInfo: 'TZ-001',
    currentGps: null,
    lastActive: null,
    status: 'active',
    baseSalary: 200000,
    commissionRate: 15,
    isSynced: true,
    ...overrides,
  } as unknown as Driver;
}

const GPS = { lat: -6.7924, lng: 39.2083 };

// ── createPayoutRequestTransaction ─────────────────────────────────────────

describe('createPayoutRequestTransaction()', () => {
  it('returns a transaction with type payout_request', () => {
    const tx = createPayoutRequestTransaction(makeLocation(), makeDriver(), GPS, 50000, 'Need cash');
    expect(tx.type).toBe('payout_request');
  });

  it('sets id with PAY- prefix', () => {
    const tx = createPayoutRequestTransaction(makeLocation(), makeDriver(), GPS, 50000, '');
    expect(tx.id).toMatch(/^PAY-/);
  });

  it('maps location and driver fields correctly', () => {
    const location = makeLocation({ id: 'L1', name: 'Shop One', lastScore: 300 });
    const driver = makeDriver({ id: 'D2', name: 'Driver Two' });
    const tx = createPayoutRequestTransaction(location, driver, GPS, 25000, 'Note');
    expect(tx.locationId).toBe('L1');
    expect(tx.locationName).toBe('Shop One');
    expect(tx.driverId).toBe('D2');
    expect(tx.driverName).toBe('Driver Two');
    expect(tx.previousScore).toBe(300);
    expect(tx.currentScore).toBe(300);
  });

  it('sets payoutAmount from argument', () => {
    const tx = createPayoutRequestTransaction(makeLocation(), makeDriver(), GPS, 75000, '');
    expect(tx.payoutAmount).toBe(75000);
  });

  it('sets notes from argument', () => {
    const tx = createPayoutRequestTransaction(makeLocation(), makeDriver(), GPS, 1000, 'urgent');
    expect(tx.notes).toBe('urgent');
  });

  it('sets approvalStatus to pending', () => {
    const tx = createPayoutRequestTransaction(makeLocation(), makeDriver(), GPS, 1000, '');
    expect(tx.approvalStatus).toBe('pending');
  });

  it('sets isSynced to false', () => {
    const tx = createPayoutRequestTransaction(makeLocation(), makeDriver(), GPS, 1000, '');
    expect(tx.isSynced).toBe(false);
  });

  it('defaults gps to {0,0} when gpsCoords is null', () => {
    const tx = createPayoutRequestTransaction(makeLocation(), makeDriver(), null, 1000, '');
    expect(tx.gps).toEqual({ lat: 0, lng: 0 });
  });

  it('uses provided gps coords', () => {
    const tx = createPayoutRequestTransaction(makeLocation(), makeDriver(), GPS, 1000, '');
    expect(tx.gps).toEqual(GPS);
  });

  it('sets all financial fields to 0', () => {
    const tx = createPayoutRequestTransaction(makeLocation(), makeDriver(), GPS, 50000, '');
    expect(tx.revenue).toBe(0);
    expect(tx.commission).toBe(0);
    expect(tx.ownerRetention).toBe(0);
    expect(tx.debtDeduction).toBe(0);
    expect(tx.startupDebtDeduction).toBe(0);
    expect(tx.expenses).toBe(0);
    expect(tx.coinExchange).toBe(0);
    expect(tx.extraIncome).toBe(0);
    expect(tx.netPayable).toBe(0);
  });

  it('sets dataUsageKB to 40', () => {
    const tx = createPayoutRequestTransaction(makeLocation(), makeDriver(), GPS, 1000, '');
    expect(tx.dataUsageKB).toBe(40);
  });

  it('includes a valid ISO timestamp', () => {
    const tx = createPayoutRequestTransaction(makeLocation(), makeDriver(), GPS, 1000, '');
    expect(() => new Date(tx.timestamp)).not.toThrow();
    expect(new Date(tx.timestamp).toString()).not.toBe('Invalid Date');
  });
});

// ── createResetRequestTransaction ──────────────────────────────────────────

describe('createResetRequestTransaction()', () => {
  it('returns a transaction with type reset_request', () => {
    const tx = createResetRequestTransaction(makeLocation(), makeDriver(), GPS, 'http://photo.jpg', '');
    expect(tx.type).toBe('reset_request');
  });

  it('sets id with RST- prefix', () => {
    const tx = createResetRequestTransaction(makeLocation(), makeDriver(), GPS, '', '');
    expect(tx.id).toMatch(/^RST-/);
  });

  it('sets photoUrl from argument', () => {
    const tx = createResetRequestTransaction(makeLocation(), makeDriver(), GPS, 'data:image/jpeg;base64,abc', '');
    expect(tx.photoUrl).toBe('data:image/jpeg;base64,abc');
  });

  it('sets notes from argument', () => {
    const tx = createResetRequestTransaction(makeLocation(), makeDriver(), GPS, '', 'machine broken');
    expect(tx.notes).toBe('machine broken');
  });

  it('sets approvalStatus to pending', () => {
    const tx = createResetRequestTransaction(makeLocation(), makeDriver(), GPS, '', '');
    expect(tx.approvalStatus).toBe('pending');
  });

  it('sets dataUsageKB to 80', () => {
    const tx = createResetRequestTransaction(makeLocation(), makeDriver(), GPS, '', '');
    expect(tx.dataUsageKB).toBe(80);
  });

  it('sets isSynced to false', () => {
    const tx = createResetRequestTransaction(makeLocation(), makeDriver(), GPS, '', '');
    expect(tx.isSynced).toBe(false);
  });

  it('defaults gps to {0,0} when gpsCoords is null', () => {
    const tx = createResetRequestTransaction(makeLocation(), makeDriver(), null, '', '');
    expect(tx.gps).toEqual({ lat: 0, lng: 0 });
  });
});

// ── createCollectionTransaction ────────────────────────────────────────────

describe('createCollectionTransaction()', () => {
  it('returns a transaction with type collection', () => {
    const tx = createCollectionTransaction(makeLocation(), makeDriver(), GPS, 600);
    expect(tx.type).toBe('collection');
  });

  it('sets approvalStatus to approved', () => {
    const tx = createCollectionTransaction(makeLocation(), makeDriver(), GPS, 600);
    expect(tx.approvalStatus).toBe('approved');
  });

  it('sets currentScore from argument', () => {
    const tx = createCollectionTransaction(makeLocation(), makeDriver(), GPS, 999);
    expect(tx.currentScore).toBe(999);
  });

  it('defaults id with TX- prefix when no txId provided', () => {
    const tx = createCollectionTransaction(makeLocation(), makeDriver(), GPS, 600);
    expect(tx.id).toMatch(/^TX-/);
  });

  it('uses txId from options when provided', () => {
    const tx = createCollectionTransaction(makeLocation(), makeDriver(), GPS, 600, { txId: 'TX-custom-001' });
    expect(tx.id).toBe('TX-custom-001');
  });

  it('uses financial values from options', () => {
    const opts = {
      revenue: 10000,
      commission: 1500,
      ownerRetention: 2000,
      debtDeduction: 500,
      startupDebtDeduction: 250,
      expenses: 300,
      coinExchange: 400,
      extraIncome: 100,
      netPayable: 5050,
    };
    const tx = createCollectionTransaction(makeLocation(), makeDriver(), GPS, 600, opts);
    expect(tx.revenue).toBe(10000);
    expect(tx.commission).toBe(1500);
    expect(tx.ownerRetention).toBe(2000);
    expect(tx.debtDeduction).toBe(500);
    expect(tx.startupDebtDeduction).toBe(250);
    expect(tx.expenses).toBe(300);
    expect(tx.coinExchange).toBe(400);
    expect(tx.extraIncome).toBe(100);
    expect(tx.netPayable).toBe(5050);
  });

  it('defaults all financial fields to 0 when options not provided', () => {
    const tx = createCollectionTransaction(makeLocation(), makeDriver(), GPS, 600);
    expect(tx.revenue).toBe(0);
    expect(tx.commission).toBe(0);
    expect(tx.ownerRetention).toBe(0);
    expect(tx.debtDeduction).toBe(0);
    expect(tx.netPayable).toBe(0);
  });

  it('sets photoUrl from options', () => {
    const tx = createCollectionTransaction(makeLocation(), makeDriver(), GPS, 600, { photoUrl: 'data:image/jpeg;base64,xyz' });
    expect(tx.photoUrl).toBe('data:image/jpeg;base64,xyz');
  });

  it('photoUrl is undefined when not provided', () => {
    const tx = createCollectionTransaction(makeLocation(), makeDriver(), GPS, 600);
    expect(tx.photoUrl).toBeUndefined();
  });

  it('sets dataUsageKB to default 100 when not specified', () => {
    const tx = createCollectionTransaction(makeLocation(), makeDriver(), GPS, 600);
    expect(tx.dataUsageKB).toBe(100);
  });

  it('uses dataUsageKB from options', () => {
    const tx = createCollectionTransaction(makeLocation(), makeDriver(), GPS, 600, { dataUsageKB: 250 });
    expect(tx.dataUsageKB).toBe(250);
  });

  it('sets anomalyFlag from options', () => {
    const tx = createCollectionTransaction(makeLocation(), makeDriver(), GPS, 600, { anomalyFlag: true });
    expect(tx.anomalyFlag).toBe(true);
  });

  it('sets notes from options', () => {
    const tx = createCollectionTransaction(makeLocation(), makeDriver(), GPS, 600, { notes: 'test note' });
    expect(tx.notes).toBe('test note');
  });

  it('sets isSynced to false', () => {
    const tx = createCollectionTransaction(makeLocation(), makeDriver(), GPS, 600);
    expect(tx.isSynced).toBe(false);
  });

  it('maps previousScore from location.lastScore', () => {
    const location = makeLocation({ lastScore: 450 });
    const tx = createCollectionTransaction(location, makeDriver(), GPS, 600);
    expect(tx.previousScore).toBe(450);
  });

  it('defaults gps to {0,0} when gpsCoords is null', () => {
    const tx = createCollectionTransaction(makeLocation(), makeDriver(), null, 600);
    expect(tx.gps).toEqual({ lat: 0, lng: 0 });
  });
});
