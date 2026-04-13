import { DailySettlement, Transaction, TRANSLATIONS } from '../../types';

export type ApprovalTaskType = 'settlement' | 'expense' | 'anomaly' | 'reset' | 'payout';

export interface ApprovalTask {
  key: string;
  type: ApprovalTaskType;
  id: string;
  driverName: string;
  locationName: string;
  amount: number;
  timestamp: string;
  severity: number;
  extra: Record<string, unknown>;
}

const EXPENSE_SEVERITY = 2;
const RESET_SEVERITY = 3;
const SETTLEMENT_SEVERITY = 4;

export function buildApprovalTasks(
  lang: 'zh' | 'sw',
  pendingSettlements: DailySettlement[],
  anomalyTransactions: Transaction[],
  pendingResetRequests: Transaction[],
  pendingExpenses: Transaction[],
  pendingPayoutRequests: Transaction[],
): ApprovalTask[] {
  return [
    ...pendingSettlements.map((settlement): ApprovalTask => ({
      key: `settlement:${settlement.id}`,
      type: 'settlement',
      id: settlement.id,
      driverName: settlement.driverName ?? '',
      locationName: lang === 'zh' ? '日结汇总' : 'Daily summary',
      amount: settlement.expectedTotal,
      timestamp: settlement.timestamp,
      severity: SETTLEMENT_SEVERITY,
      extra: { settlement },
    })),
    ...anomalyTransactions.map((tx): ApprovalTask => ({
      key: `anomaly:${tx.id}`,
      type: 'anomaly',
      id: tx.id,
      driverName: tx.driverName ?? '',
      locationName: tx.locationName,
      amount: tx.revenue,
      timestamp: tx.timestamp,
      severity: RESET_SEVERITY,
      extra: { tx },
    })),
    ...pendingResetRequests.map((tx): ApprovalTask => ({
      key: `reset:${tx.id}`,
      type: 'reset',
      id: tx.id,
      driverName: tx.driverName ?? '',
      locationName: tx.locationName,
      amount: tx.currentScore,
      timestamp: tx.timestamp,
      severity: RESET_SEVERITY,
      extra: { tx },
    })),
    ...pendingExpenses.map((tx): ApprovalTask => ({
      key: `expense:${tx.id}`,
      type: 'expense',
      id: tx.id,
      driverName: tx.driverName ?? '',
      locationName: tx.locationName,
      amount: tx.expenses,
      timestamp: tx.timestamp,
      severity: EXPENSE_SEVERITY,
      extra: { tx },
    })),
    ...pendingPayoutRequests.map((tx): ApprovalTask => ({
      key: `payout:${tx.id}`,
      type: 'payout',
      id: tx.id,
      driverName: tx.driverName ?? '',
      locationName: tx.locationName,
      amount: tx.payoutAmount || 0,
      timestamp: tx.timestamp,
      severity: EXPENSE_SEVERITY,
      extra: { tx },
    })),
  ].sort((a, b) =>
    b.severity !== a.severity
      ? b.severity - a.severity
      : new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );
}

export function getExpenseCategoryLabel(
  t: typeof TRANSLATIONS['zh'],
  category: Transaction['expenseCategory'],
): string {
  const labels = {
    tip: `💸 ${t.tipLabel}`,
    electricity: `💡 ${t.electricityLabel}`,
    fuel: `⛽ ${t.fuelLabel}`,
    repair: `🔧 ${t.repairLabel}`,
    fine: `🚨 ${t.fineLabel}`,
    transport: `🛺 ${t.transportLabel}`,
    allowance: `🍽 ${t.allowanceLabel}`,
    salary_advance: `💰 ${t.salaryAdvanceLabel}`,
    office_loan: `🏢 ${t.officeLoanLabel}`,
    other: `📋 ${t.otherLabel}`,
  } satisfies Record<NonNullable<Transaction['expenseCategory']>, string>;

  return labels[category || 'other'] || `📋 ${t.otherLabel}`;
}
