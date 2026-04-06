import { describe, expect, it } from '@jest/globals';
import type { Location, Transaction } from '../types/models';
import {
  getLocationDeletionDiagnostics,
  normalizeMachineId,
} from '../utils/locationWorkflow';

function makeLocation(overrides: Partial<Location> = {}): Location {
  return {
    id: 'loc-1',
    name: 'Shop One',
    machineId: 'B1',
    lastScore: 120,
    area: 'Kinondoni',
    initialStartupDebt: 0,
    remainingStartupDebt: 0,
    status: 'active',
    commissionRate: 0.15,
    ...overrides,
  };
}

function makeTransaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 'tx-1',
    timestamp: '2026-04-05T10:00:00.000Z',
    locationId: 'loc-1',
    locationName: 'Shop One',
    driverId: 'drv-1',
    previousScore: 100,
    currentScore: 120,
    revenue: 40000,
    commission: 6000,
    ownerRetention: 6000,
    debtDeduction: 0,
    startupDebtDeduction: 0,
    expenses: 0,
    coinExchange: 0,
    extraIncome: 0,
    netPayable: 30000,
    gps: { lat: -6.8, lng: 39.2 },
    dataUsageKB: 120,
    isSynced: true,
    type: 'collection',
    paymentStatus: 'paid',
    approvalStatus: 'approved',
    ...overrides,
  };
}

describe('locationWorkflow', () => {
  it('normalizes machine ids consistently', () => {
    expect(normalizeMachineId(' b 1 ')).toBe('B1');
    expect(normalizeMachineId('m-001')).toBe('M-001');
  });

  it('blocks deletion when the machine still has active workflow references', () => {
    const diagnostics = getLocationDeletionDiagnostics({
      location: makeLocation({
        assignedDriverId: 'drv-1',
        remainingStartupDebt: 5000,
        dividendBalance: 2000,
        resetLocked: true,
      }),
      transactions: [
        makeTransaction({ approvalStatus: 'pending' }),
        makeTransaction({ id: 'tx-2', paymentStatus: 'pending' }),
      ],
      pendingResetRequests: [makeTransaction({ id: 'reset-1', type: 'reset_request', approvalStatus: 'pending' })],
      pendingPayoutRequests: [makeTransaction({ id: 'pay-1', type: 'payout_request', approvalStatus: 'pending' })],
    });

    expect(diagnostics.blockers).toEqual(
      expect.arrayContaining([
        '该机器仍绑定在司机名下，请先解绑再删除。',
        '该机器尚有未清启动债务 TZS 5,000，无法删除。',
        '该机器尚有未付业主分红余额，无法删除。',
        '该机器当前处于重置锁定状态，无法删除。',
        '该机器有待处理的重置申请，无法删除。',
        '该机器有待处理的提现申请，无法删除。',
        '该机器有等待审批的交易记录，无法删除。',
        '该机器有未结算的收款记录，无法删除。',
      ]),
    );
  });

  it('allows deletion but warns when only historical records remain', () => {
    const diagnostics = getLocationDeletionDiagnostics({
      location: makeLocation(),
      transactions: [makeTransaction()],
      pendingResetRequests: [],
      pendingPayoutRequests: [],
    });

    expect(diagnostics.blockers).toEqual([]);
    expect(diagnostics.warnings).toEqual([
      '删除后，历史交易记录仍会保留在报表中。',
    ]);
  });
});
