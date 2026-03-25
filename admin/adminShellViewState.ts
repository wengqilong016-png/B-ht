import type { DailySettlement, Transaction } from '../types';
import type { AdminView } from './adminShellConfig';

export function calculateAdminApprovalBadge(
  transactions: Transaction[],
  dailySettlements: DailySettlement[],
): number {
  const pendingSettlementCount = dailySettlements.filter(s => s.status === 'pending').length;
  const pendingExpenseCount = transactions.filter(t => t.expenses > 0 && t.expenseStatus === 'pending').length;
  const anomalyCount = transactions.filter(
    t => t.isAnomaly === true && t.approvalStatus !== 'approved' && t.approvalStatus !== 'rejected',
  ).length;
  const pendingResetRequestCount = transactions.filter(
    t => t.type === 'reset_request' && t.approvalStatus === 'pending',
  ).length;
  const pendingPayoutRequestCount = transactions.filter(
    t => t.type === 'payout_request' && t.approvalStatus === 'pending',
  ).length;

  return pendingSettlementCount + pendingExpenseCount + anomalyCount + pendingResetRequestCount + pendingPayoutRequestCount;
}

export function isDashboardBackedAdminView(view: AdminView): boolean {
  return ['dashboard', 'settlement', 'map', 'sites', 'ai'].includes(view);
}
