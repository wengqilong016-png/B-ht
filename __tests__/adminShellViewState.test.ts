/**
 * __tests__/adminShellViewState.test.ts
 *
 * Tests for admin/adminShellViewState.ts
 */
import { describe, it, expect } from '@jest/globals';

import {
  calculateAdminApprovalBadge,
  isDashboardBackedAdminView,
} from '../admin/adminShellViewState';

import type { Transaction, DailySettlement } from '../types';

// ── helpers ──────────────────────────────────────────────────────────────────

function makeTx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: `tx-${Math.random().toString(36).slice(2)}`,
    timestamp: new Date().toISOString(),
    locationId: 'loc-1',
    locationName: 'Shop',
    driverId: 'drv-1',
    driverName: 'Driver',
    previousScore: 100,
    currentScore: 200,
    revenue: 0,
    commission: 0,
    ownerRetention: 0,
    debtDeduction: 0,
    startupDebtDeduction: 0,
    expenses: 0,
    coinExchange: 0,
    extraIncome: 0,
    netPayable: 0,
    gps: { lat: 0, lng: 0 },
    dataUsageKB: 10,
    isSynced: true,
    type: 'collection',
    approvalStatus: 'approved',
    ...overrides,
  } as unknown as Transaction;
}

function makeSettlement(overrides: Partial<DailySettlement> = {}): DailySettlement {
  return {
    id: `set-${Math.random().toString(36).slice(2)}`,
    date: new Date().toISOString(),
    adminId: 'admin-1',
    adminName: 'Admin',
    driverId: 'drv-1',
    driverName: 'Driver',
    totalRevenue: 0,
    totalNetPayable: 0,
    totalExpenses: 0,
    driverFloat: 0,
    expectedTotal: 0,
    actualCash: 0,
    actualCoins: 0,
    shortage: 0,
    note: '',
    timestamp: new Date().toISOString(),
    status: 'confirmed',
    isSynced: true,
    ...overrides,
  } as unknown as DailySettlement;
}

// ── calculateAdminApprovalBadge ───────────────────────────────────────────────

describe('calculateAdminApprovalBadge()', () => {
  it('returns 0 when no pending items', () => {
    const txs = [makeTx({ approvalStatus: 'approved', expenses: 0, isAnomaly: false })];
    const sets = [makeSettlement({ status: 'confirmed' })];
    expect(calculateAdminApprovalBadge(txs, sets)).toBe(0);
  });

  it('counts pending daily settlements', () => {
    const sets = [makeSettlement({ status: 'pending' }), makeSettlement({ status: 'pending' })];
    expect(calculateAdminApprovalBadge([], sets)).toBe(2);
  });

  it('counts pending expense transactions', () => {
    const txs = [
      makeTx({ expenses: 1000, expenseStatus: 'pending' }),
      makeTx({ expenses: 500, expenseStatus: 'pending' }),
    ];
    expect(calculateAdminApprovalBadge(txs, [])).toBe(2);
  });

  it('does not count expense transactions with 0 expenses', () => {
    const txs = [makeTx({ expenses: 0, expenseStatus: 'pending' })];
    expect(calculateAdminApprovalBadge(txs, [])).toBe(0);
  });

  it('counts unapproved anomalies', () => {
    const txs = [
      makeTx({ isAnomaly: true, approvalStatus: 'pending' }),
      makeTx({ isAnomaly: true, approvalStatus: 'pending' }),
    ];
    expect(calculateAdminApprovalBadge(txs, [])).toBe(2);
  });

  it('does not count approved anomalies', () => {
    const txs = [makeTx({ isAnomaly: true, approvalStatus: 'approved' })];
    expect(calculateAdminApprovalBadge(txs, [])).toBe(0);
  });

  it('does not count rejected anomalies', () => {
    const txs = [makeTx({ isAnomaly: true, approvalStatus: 'rejected' })];
    expect(calculateAdminApprovalBadge(txs, [])).toBe(0);
  });

  it('counts pending reset requests', () => {
    const txs = [
      makeTx({ type: 'reset_request', approvalStatus: 'pending' }),
      makeTx({ type: 'reset_request', approvalStatus: 'pending' }),
    ];
    expect(calculateAdminApprovalBadge(txs, [])).toBe(2);
  });

  it('counts pending payout requests', () => {
    const txs = [makeTx({ type: 'payout_request', approvalStatus: 'pending' })];
    expect(calculateAdminApprovalBadge(txs, [])).toBe(1);
  });

  it('accumulates all pending types', () => {
    const txs = [
      makeTx({ expenses: 500, expenseStatus: 'pending' }),
      makeTx({ isAnomaly: true, approvalStatus: 'pending' }),
      makeTx({ type: 'reset_request', approvalStatus: 'pending' }),
      makeTx({ type: 'payout_request', approvalStatus: 'pending' }),
    ];
    const sets = [makeSettlement({ status: 'pending' })];
    expect(calculateAdminApprovalBadge(txs, sets)).toBe(5);
  });

  it('returns 0 for empty arrays', () => {
    expect(calculateAdminApprovalBadge([], [])).toBe(0);
  });
});

// ── isDashboardBackedAdminView ────────────────────────────────────────────────

describe('isDashboardBackedAdminView()', () => {
  it('returns true for dashboard', () => {
    expect(isDashboardBackedAdminView('dashboard' as any)).toBe(true);
  });

  it('returns true for settlement', () => {
    expect(isDashboardBackedAdminView('settlement' as any)).toBe(true);
  });

  it('returns true for map', () => {
    expect(isDashboardBackedAdminView('map' as any)).toBe(true);
  });

  it('returns true for sites', () => {
    expect(isDashboardBackedAdminView('sites' as any)).toBe(true);
  });

  it('returns false for other views', () => {
    expect(isDashboardBackedAdminView('drivers' as any)).toBe(false);
    expect(isDashboardBackedAdminView('transactions' as any)).toBe(false);
    expect(isDashboardBackedAdminView('' as any)).toBe(false);
  });
});
