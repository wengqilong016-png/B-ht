/** Domain interfaces — the core data shapes persisted to Supabase and localStorage. */

export interface Location {
  id: string;
  name: string;
  machineId: string;
  lastScore: number;
  area: string;
  assignedDriverId?: string;
  ownerName?: string;
  shopOwnerPhone?: string;
  ownerPhotoUrl?: string;
  machinePhotoUrl?: string;
  initialStartupDebt: number;
  remainingStartupDebt: number;
  isNewOffice?: boolean;
  coords?: { lat: number; lng: number };
  status: 'active' | 'inactive' | 'maintenance' | 'broken';
  lastRevenueDate?: string;
  commissionRate: number;
  resetLocked?: boolean;
  dividendBalance?: number;
  createdAt?: string;
  lastRelocatedAt?: string;
  isSynced?: boolean;
}

export interface User {
  id: string;
  username: string;
  role: 'admin' | 'driver';
  name: string;
  /** For driver-role users, references public.drivers.id (User.id stays the auth user id). */
  driverId?: string;
  /** When true, user must change password before accessing the app. */
  mustChangePassword?: boolean;
}

export interface AILog {
  id: string;
  timestamp: string;
  driverId: string;
  driverName: string;
  query: string;
  response: string;
  imageUrl?: string;
  modelUsed: string;
  relatedLocationId?: string;
  relatedTransactionId?: string;
  isSynced?: boolean;
}

export interface Transaction {
  id: string;
  timestamp: string;
  uploadTimestamp?: string;
  locationId: string;
  locationName: string;
  driverId: string;
  driverName?: string;
  previousScore: number;
  currentScore: number;
  revenue: number;
  commission: number;
  ownerRetention: number;
  debtDeduction: number;
  startupDebtDeduction: number;
  expenses: number;
  coinExchange: number;
  extraIncome: number;
  netPayable: number;
  gps: { lat: number; lng: number };
  gpsDeviation?: number;
  photoUrl?: string;
  dataUsageKB: number;
  aiScore?: number;
  isAnomaly?: boolean;
  notes?: string;
  isClearance?: boolean;
  isSynced: boolean;
  reportedStatus?: 'active' | 'maintenance' | 'broken';
  paymentStatus?: 'unpaid' | 'pending' | 'paid' | 'rejected';
  type?: 'collection' | 'expense' | 'reset_request' | 'payout_request';

  /** Approval pipeline status (AI auto-approve / admin manual review) */
  approvalStatus?: 'auto-approved' | 'pending' | 'approved' | 'rejected';

  /** Public = Company Cost, Private = Driver Loan */
  expenseType?: 'public' | 'private';
  expenseCategory?: 'tip' | 'fuel' | 'repair' | 'fine' | 'allowance' | 'salary_advance' | 'other' | 'transport';
  expenseStatus?: 'pending' | 'approved' | 'rejected';
  expenseDescription?: string;

  /** Payout request fields (店主分红提现) */
  payoutAmount?: number;

  anomalyFlag?: boolean;
}

export interface Driver {
  id: string;
  name: string;
  username: string;
  phone: string;
  backgroundPhotoUrl?: string;
  initialDebt: number;
  remainingDebt: number;
  dailyFloatingCoins: number;
  vehicleInfo: {
    model: string;
    plate: string;
  };
  currentGps?: { lat: number; lng: number };
  lastActive?: string;
  status: 'active' | 'inactive';
  baseSalary: number;
  commissionRate: number;
  isSynced?: boolean;
}

export interface DailySettlement {
  id: string;
  date: string;
  adminId?: string;
  adminName?: string;
  driverId?: string;
  driverName?: string;

  totalRevenue: number;
  totalNetPayable: number;
  totalExpenses: number;
  driverFloat: number;
  expectedTotal: number;

  actualCash: number;
  actualCoins: number;
  shortage: number;

  note?: string;
  timestamp: string;
  transferProofUrl?: string;

  status: 'pending' | 'confirmed' | 'rejected';
  isSynced?: boolean;
}

export interface MonthlyPayroll {
  id: string;
  driverId: string;
  driverName: string;
  month: string;
  baseSalary: number;
  commission: number;
  privateLoanDeduction: number;
  shortageDeduction: number;
  netPayable: number;
  collectionCount: number;
  totalRevenue: number;
  status: 'pending' | 'paid' | 'cancelled';
  paymentMethod?: 'cash' | 'bank_transfer' | 'mobile_money' | 'other';
  paymentProofUrl?: string;
  note?: string;
  createdAt: string;
  paidAt?: string;
  paidBy?: string;
  paidByName?: string;
  isSynced?: boolean;
}

/**
 * Patch payload sent by a driver when requesting a location data update.
 * Keys match the camelCase column names in public.locations.
 */
export interface LocationChangePatch {
  name?: string;
  area?: string;
  machineId?: string;
  coords?: { lat: number; lng: number };
  ownerName?: string;
  shopOwnerPhone?: string;
  ownerPhotoUrl?: string;
  machinePhotoUrl?: string;
  assignedDriverId?: string;
  commissionRate?: number;
  initialStartupDebt?: number;
  remainingStartupDebt?: number;
  isNewOffice?: boolean;
  lastRevenueDate?: string;
  status?: 'active' | 'inactive' | 'maintenance' | 'broken';
}

/**
 * A driver's request to update a location's information.
 * Persisted in public.location_change_requests.
 */
export interface LocationChangeRequest {
  id: string;
  locationId: string;
  locationName?: string;
  requestedByAuthUserId: string;
  requestedByDriverId?: string;
  requestedByDriverName?: string;
  status: 'pending' | 'approved' | 'rejected';
  reason?: string;
  patch: LocationChangePatch;
  createdAt: string;
  reviewedAt?: string;
  reviewedByAuthUserId?: string;
  reviewNote?: string;
}

export type FinanceAuditEventType =
  | 'startup_debt_recovery'
  | 'driver_debt_change'
  | 'commission_rate_change'
  | 'startup_debt_edit'
  | 'floating_coins_change'
  | 'force_clear_blockers'
  | 'location_delete';

export interface FinanceAuditLog {
  id: string;
  event_type: FinanceAuditEventType;
  entity_type: 'location' | 'driver';
  entity_id: string;
  entity_name?: string;
  actor_id: string;
  old_value: number | null;
  new_value: number | null;
  payload: Record<string, unknown>;
  created_at: string;
}
