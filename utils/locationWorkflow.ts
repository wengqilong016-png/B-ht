import type { Location, Transaction } from '../types/models';

export interface LocationDeletionDiagnostics {
  blockers: string[];
  warnings: string[];
}

export function normalizeMachineId(value: string): string {
  return value.trim().replace(/\s+/g, '').toUpperCase();
}

export function getLocationDeletionDiagnostics(params: {
  location: Location;
  transactions: Transaction[];
  pendingResetRequests: Transaction[];
  pendingPayoutRequests: Transaction[];
  /** Admin users: assigned-driver check becomes a warning, not a hard blocker */
  isAdminOverride?: boolean;
}): LocationDeletionDiagnostics {
  const { location, transactions, pendingResetRequests, pendingPayoutRequests, isAdminOverride = false } = params;
  const blockers: string[] = [];
  const warnings: string[] = [];

  const locationTransactions = transactions.filter((tx) => tx.locationId === location.id);
  const pendingApprovalTransactions = locationTransactions.filter((tx) => tx.approvalStatus === 'pending');
  const unsettledCollections = locationTransactions.filter(
    (tx) =>
      tx.type === 'collection' &&
      (tx.paymentStatus === 'unpaid' || tx.paymentStatus === 'pending'),
  );
  const locationPendingResets = pendingResetRequests.filter((tx) => tx.locationId === location.id);
  const locationPendingPayouts = pendingPayoutRequests.filter((tx) => tx.locationId === location.id);

  if (location.assignedDriverId) {
    if (isAdminOverride) {
      warnings.push('该机器仍绑定司机，删除将自动解绑。');
    } else {
      blockers.push('该机器仍绑定在司机名下，请先解绑再删除。');
    }
  }

  if ((location.remainingStartupDebt ?? 0) > 0) {
    blockers.push('该机器尚有未清启动债务，无法删除。');
  }

  if ((location.dividendBalance ?? 0) > 0) {
    blockers.push('该机器尚有未付业主分红余额，无法删除。');
  }

  if (location.resetLocked) {
    blockers.push('该机器当前处于重置锁定状态，无法删除。');
  }

  if (locationPendingResets.length > 0) {
    blockers.push('该机器有待处理的重置申请，无法删除。');
  }

  if (locationPendingPayouts.length > 0) {
    blockers.push('该机器有待处理的提现申请，无法删除。');
  }

  if (pendingApprovalTransactions.length > 0) {
    blockers.push('该机器有等待审批的交易记录，无法删除。');
  }

  if (unsettledCollections.length > 0) {
    blockers.push('该机器有未结算的收款记录，无法删除。');
  }

  if (locationTransactions.length > 0) {
    warnings.push('删除后，历史交易记录仍会保留在报表中。');
  }

  return { blockers, warnings };
}
