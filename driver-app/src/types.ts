export interface Driver {
  id: string;
  name: string;
  username: string;
  phone: string;
  initialDebt?: number;
  remainingDebt: number;
  dailyFloatingCoins: number;
  vehicleInfo?: {
    model: string;
    plate: string;
  };
  currentGps?: { lat: number; lng: number };
  lastActive?: string;
  status: 'active' | 'inactive';
  baseSalary?: number;
  commissionRate?: number;
  isSynced?: boolean;
}

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
  initialStartupDebt?: number;
  remainingStartupDebt?: number;
  isNewOffice?: boolean;
  coords?: { lat: number; lng: number };
  status: 'active' | 'maintenance' | 'broken';
  lastRevenueDate?: string;
  commissionRate: number;
  resetLocked?: boolean;
  dividendBalance?: number;
  isSynced?: boolean;
}

export interface User {
  id: string;
  username: string;
  role: 'admin' | 'driver';
  name: string;
  driverId?: string;
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
  ownerRetention?: number;
  debtDeduction?: number;
  startupDebtDeduction?: number;
  expenses: number;
  coinExchange: number;
  extraIncome?: number;
  netPayable: number;
  gps?: { lat: number; lng: number };
  gpsDeviation?: number;
  photoUrl?: string;
  dataUsageKB?: number;
  aiScore?: number;
  isAnomaly?: boolean;
  notes?: string;
  isClearance?: boolean;
  isSynced: boolean;
  reportedStatus?: 'active' | 'maintenance' | 'broken';
  paymentStatus?: 'unpaid' | 'pending' | 'paid' | 'rejected';
  type?: 'collection' | 'expense' | 'reset_request' | 'payout_request';
  approvalStatus?: 'auto-approved' | 'pending' | 'approved' | 'rejected';
  expenseType?: 'public' | 'private';
  expenseCategory?: 'fuel' | 'repair' | 'fine' | 'allowance' | 'salary_advance' | 'other';
  expenseStatus?: 'pending' | 'approved' | 'rejected';
  expenseDescription?: string;
  payoutAmount?: number;
  localId?: string;
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
  status?: 'active' | 'maintenance' | 'broken';
}

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

// Keep for backward compatibility with existing driver-app imports
export const COIN_VALUE_TZS = 200;

// Full CONSTANTS object matching root types.ts
export const CONSTANTS = {
  COIN_VALUE_TZS: 200,
  DEFAULT_PROFIT_SHARE: 0.15,
  DEBT_RECOVERY_RATE: 0.10,
  ROLLOVER_THRESHOLD: 10000,
  OFFLINE_STORAGE_KEY: 'kiosk_offline_tx',
  STORAGE_LOCATIONS_KEY: 'kiosk_locations_data',
  STORAGE_DRIVERS_KEY: 'kiosk_drivers_data_v3',
  STORAGE_SETTLEMENTS_KEY: 'kiosk_daily_settlements',
  STORAGE_TRANSACTIONS_KEY: 'kiosk_transactions_data',
  STORAGE_AI_LOGS_KEY: 'kiosk_ai_logs',
  STORAGE_NOTIFICATIONS_KEY: 'kiosk_notifications',
  IMAGE_MAX_WIDTH: 800,
  IMAGE_QUALITY: 0.6,
  STAGNANT_DAYS_THRESHOLD: 7,
};

/**
 * iOS-safe UUID generator: falls back to a timestamp+random string on iOS < 15.4
 * where crypto.randomUUID() is not available.
 */
export const safeRandomUUID = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Polyfill for older iOS Safari
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};
