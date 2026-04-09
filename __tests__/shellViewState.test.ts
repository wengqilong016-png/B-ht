import { describe, expect, it } from '@jest/globals';

import { calculateAdminApprovalBadge, isDashboardBackedAdminView } from '../admin/adminShellViewState';
import { resolveCurrentDriver } from '../driver/driverShellViewState';

import type { DailySettlement, Driver, Transaction } from '../types';

describe('shell view state helpers', () => {
  it('calculateAdminApprovalBadge sums pending settlement/expense/anomaly/reset/payout items', () => {
    const transactions = [
      { id: 't-expense', expenses: 100, expenseStatus: 'pending' },
      { id: 't-anomaly', isAnomaly: true, approvalStatus: 'pending' },
      { id: 't-reset', type: 'reset_request', approvalStatus: 'pending' },
      { id: 't-payout', type: 'payout_request', approvalStatus: 'pending' },
      { id: 't-ignore-anomaly-approved', isAnomaly: true, approvalStatus: 'approved' },
      { id: 't-ignore-expense', expenses: 10, expenseStatus: 'approved' },
    ] as Transaction[];

    const dailySettlements = [
      { id: 's-pending', status: 'pending' },
      { id: 's-confirmed', status: 'confirmed' },
    ] as DailySettlement[];

    expect(calculateAdminApprovalBadge(transactions, dailySettlements)).toBe(5);
  });

  it('isDashboardBackedAdminView returns true for dashboard-backed views', () => {
    expect(isDashboardBackedAdminView('dashboard')).toBe(true);
    expect(isDashboardBackedAdminView('settlement')).toBe(true);
  });

  it('isDashboardBackedAdminView returns false for non-dashboard-backed views', () => {
    expect(isDashboardBackedAdminView('team')).toBe(false);
    expect(isDashboardBackedAdminView('history')).toBe(false);
  });

  it('resolveCurrentDriver returns active driver when activeDriverId is matched', () => {
    const drivers = [
      { id: 'd-1', name: 'Driver 1' },
      { id: 'd-2', name: 'Driver 2' },
    ] as Driver[];

    expect(resolveCurrentDriver(drivers, 'd-2')?.id).toBe('d-2');
  });

  it('resolveCurrentDriver falls back to first driver when activeDriverId does not match', () => {
    const drivers = [
      { id: 'd-1', name: 'Driver 1' },
      { id: 'd-2', name: 'Driver 2' },
    ] as Driver[];

    expect(resolveCurrentDriver(drivers, 'd-404')?.id).toBe('d-1');
  });

  it('resolveCurrentDriver returns undefined for empty driver list', () => {
    expect(resolveCurrentDriver([], 'd-1')).toBeUndefined();
  });
});
