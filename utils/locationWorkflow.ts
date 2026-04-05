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
}): LocationDeletionDiagnostics {
  const { location, transactions, pendingResetRequests, pendingPayoutRequests } = params;
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
    blockers.push('Machine is still assigned to a driver.');
  }

  if ((location.remainingStartupDebt ?? 0) > 0) {
    blockers.push('Machine still has remaining startup debt.');
  }

  if ((location.dividendBalance ?? 0) > 0) {
    blockers.push('Machine still has unpaid owner dividend balance.');
  }

  if (location.resetLocked) {
    blockers.push('Machine is currently reset-locked.');
  }

  if (locationPendingResets.length > 0) {
    blockers.push('Machine has pending reset requests.');
  }

  if (locationPendingPayouts.length > 0) {
    blockers.push('Machine has pending payout requests.');
  }

  if (pendingApprovalTransactions.length > 0) {
    blockers.push('Machine has transactions still waiting for approval.');
  }

  if (unsettledCollections.length > 0) {
    blockers.push('Machine has unsettled collection records.');
  }

  if (locationTransactions.length > 0) {
    warnings.push('Historical transactions will remain in reports after deletion.');
  }

  return { blockers, warnings };
}
