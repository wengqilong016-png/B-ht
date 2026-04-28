import { Transaction, Location, Driver, safeRandomUUID } from '../types';

/**
 * Common fields shared across all transaction types
 */
interface BaseTransactionFields {
  locationId: string;
  locationName: string;
  driverId: string;
  driverName: string;
  previousScore: number;
  currentScore: number;
  gps: { lat: number; lng: number };
  isSynced: boolean;
}

/**
 * Creates base transaction fields from location and driver data.
 *
 * NOTE: currentScore defaults to location.lastScore. Collection-type
 * callers MUST override it with the actual meter reading. Non-collection
 * types (payout, reset, expense) intentionally keep currentScore equal
 * to previousScore/ lastScore — there is no new meter reading for those
 * transaction types, and server functions apply the same convention.
 */
function createBaseTransaction(
  location: Location,
  driver: Driver,
  gpsCoords: { lat: number; lng: number } | null
): BaseTransactionFields {
  return {
    locationId: location.id,
    locationName: location.name,
    driverId: driver.id,
    driverName: driver.name,
    previousScore: location.lastScore,
    currentScore: location.lastScore,
    gps: gpsCoords || { lat: 0, lng: 0 },
    isSynced: false,
  };
}

/**
 * Creates default financial fields for transactions
 */
function createDefaultFinancials() {
  return {
    revenue: 0,
    commission: 0,
    ownerRetention: 0,
    debtDeduction: 0,
    startupDebtDeduction: 0,
    expenses: 0,
    coinExchange: 0,
    extraIncome: 0,
    netPayable: 0,
  };
}

/**
 * Creates a payout request transaction
 */
export function createPayoutRequestTransaction(
  location: Location,
  driver: Driver,
  gpsCoords: { lat: number; lng: number } | null,
  payoutAmount: number,
  notes: string
): Transaction {
  return {
    id: `PAY-${Date.now()}`,
    timestamp: new Date().toISOString(),
    ...createBaseTransaction(location, driver, gpsCoords),
    ...createDefaultFinancials(),
    dataUsageKB: 40,
    type: 'payout_request',
    approvalStatus: 'pending',
    payoutAmount,
    notes,
    // currentScore is intentionally lastScore (inherited from createBaseTransaction):
    // payout requests do not carry a new meter reading.
  };
}

/**
 * Creates a reset request transaction
 */
export function createResetRequestTransaction(
  location: Location,
  driver: Driver,
  gpsCoords: { lat: number; lng: number } | null,
  photoUrl: string,
  notes: string
): Transaction {
  return {
    id: `RST-${Date.now()}`,
    timestamp: new Date().toISOString(),
    ...createBaseTransaction(location, driver, gpsCoords),
    ...createDefaultFinancials(),
    photoUrl,
    dataUsageKB: 80,
    type: 'reset_request',
    approvalStatus: 'pending',
    notes,
    // currentScore is intentionally lastScore (inherited from createBaseTransaction):
    // reset requests do not carry a new meter reading.
  };
}

/**
 * Creates a collection transaction
 */
export function createCollectionTransaction(
  location: Location,
  driver: Driver,
  gpsCoords: { lat: number; lng: number } | null,
  currentScore: number,
  options: {
    txId?: string;
    revenue?: number;
    commission?: number;
    ownerRetention?: number;
    debtDeduction?: number;
    startupDebtDeduction?: number;
    expenses?: number;
    tip?: number;
    coinExchange?: number;
    extraIncome?: number;
    netPayable?: number;
    photoUrl?: string;
    dataUsageKB?: number;
    notes?: string;
    anomalyFlag?: boolean;
  } = {}
): Transaction {
  const base = createBaseTransaction(location, driver, gpsCoords);
  const financials = createDefaultFinancials();

  return {
    id: options.txId || `TX-${Date.now()}`,
    timestamp: new Date().toISOString(),
    ...base,
    currentScore,
    revenue: options.revenue ?? financials.revenue,
    commission: options.commission ?? financials.commission,
    ownerRetention: options.ownerRetention ?? financials.ownerRetention,
    debtDeduction: options.debtDeduction ?? financials.debtDeduction,
    startupDebtDeduction: options.startupDebtDeduction ?? financials.startupDebtDeduction,
    expenses: options.expenses ?? financials.expenses,
    tip: options.tip ?? 0,
    coinExchange: options.coinExchange ?? financials.coinExchange,
    extraIncome: options.extraIncome ?? financials.extraIncome,
    netPayable: options.netPayable ?? financials.netPayable,
    photoUrl: options.photoUrl,
    dataUsageKB: options.dataUsageKB ?? 100,
    type: 'collection',
    approvalStatus: 'approved',
    notes: options.notes,
    anomalyFlag: options.anomalyFlag,
  };
}

export function createExpenseTransaction(
  location: Location,
  driver: Driver,
  gpsCoords: { lat: number; lng: number } | null,
  options: {
    amount: number;
    expenseType: NonNullable<Transaction['expenseType']>;
    expenseCategory: NonNullable<Transaction['expenseCategory']>;
    expenseDescription?: string;
    notes?: string;
  }
): Transaction {
  return {
    id: `EXP-${safeRandomUUID()}`,
    timestamp: new Date().toISOString(),
    ...createBaseTransaction(location, driver, gpsCoords),
    ...createDefaultFinancials(),
    dataUsageKB: 40,
    type: 'expense',
    approvalStatus: 'pending',
    expenseStatus: 'pending',
    expenses: options.amount,
    expenseType: options.expenseType,
    expenseCategory: options.expenseCategory,
    expenseDescription: options.expenseDescription,
    notes: options.notes,
    // currentScore is intentionally lastScore (inherited from createBaseTransaction):
    // expense transactions do not carry a new meter reading.
  };
}
