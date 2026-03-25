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
  status: 'active' | 'maintenance' | 'broken';
  lastRevenueDate?: string;
  commissionRate: number;
  resetLocked?: boolean; // Locked when a 9999 reset request is pending
  dividendBalance?: number; // Accumulated owner dividend not yet withdrawn
  isSynced?: boolean; // Added for offline sync tracking
}

export interface User {
  id: string;
  username: string;
  role: 'admin' | 'driver';
  name: string;
  // For driver-role users, this references public.drivers.id while User.id remains the auth user id.
  driverId?: string;
  /**
   * When true the app must show the ForcePasswordChange screen before granting
   * access to any other view.  Cleared in the DB once the user sets a new
   * password.  Defaults to false / undefined for existing sessions.
   */
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
  isSynced?: boolean; // Added for offline sync tracking
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
  
  // Approval pipeline status (AI auto-approve / admin manual review)
  approvalStatus?: 'auto-approved' | 'pending' | 'approved' | 'rejected';

  // New Fields for Expense Approval
  expenseType?: 'public' | 'private'; // Public = Company Cost, Private = Driver Loan
  expenseCategory?: 'fuel' | 'repair' | 'fine' | 'allowance' | 'salary_advance' | 'other' | 'transport';
  expenseStatus?: 'pending' | 'approved' | 'rejected';
  expenseDescription?: string;

  // Payout request fields (店主分红提现)
  payoutAmount?: number;

  // AI anomaly detection flag
  anomalyFlag?: boolean;
}

export interface Driver {
  id: string;
  name: string;
  username: string;
  phone: string;
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
  isSynced?: boolean; // Added for offline sync tracking
}

export interface DailySettlement {
  id: string;
  date: string;
  // If submitted by driver, adminId is null initially
  adminId?: string;
  adminName?: string;
  driverId?: string; // New: Who submitted it
  driverName?: string; // New
  
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
  
  // New: Workflow status
  status: 'pending' | 'confirmed' | 'rejected';
  isSynced?: boolean; // Added for offline sync tracking
}

/**
 * Patch payload sent by a driver when requesting a location data update.
 * Keys match the camelCase column names in the public.locations table.
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
  status?: 'active' | 'maintenance' | 'broken';
}

/**
 * A driver's request to update a location's information.
 * Persisted in public.location_change_requests; fields use camelCase to
 * match the frontend domain model (DB row is snake_case).
 */
export interface LocationChangeRequest {
  id: string;
  locationId: string;
  locationName?: string; // Joined client-side for display
  requestedByAuthUserId: string;
  requestedByDriverId?: string;
  requestedByDriverName?: string; // Joined client-side for display
  status: 'pending' | 'approved' | 'rejected';
  reason?: string;
  /** The proposed changes; only fields present in this object will be applied. */
  patch: LocationChangePatch;
  createdAt: string;
  reviewedAt?: string;
  reviewedByAuthUserId?: string;
  reviewNote?: string;
}

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

export const isLikelyEmail = (value: string): boolean =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

/**
 * Resize an image file to a max width and return a data URL.
 * Shared utility to avoid duplicating the canvas-based resize logic across components.
 */
export const resizeImage = (
  file: File,
  maxWidth: number = 800,
  quality: number = 0.6,
): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.onload = (ev) => {
      const img = new Image();
      img.onerror = () => reject(new Error('Failed to load image'));
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const scale = Math.min(1, maxWidth / img.width);
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Failed to get canvas context'));
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = ev.target?.result as string;
    };
    reader.readAsDataURL(file);
  });

// ─── Domain Constants & Enums ──────────────────────────────────────────────
// Centralized status values so callers reference constants instead of raw strings.

/** Transaction approval pipeline statuses */
export const ApprovalStatus = {
  AUTO_APPROVED: 'auto-approved',
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
} as const;
export type ApprovalStatusValue = typeof ApprovalStatus[keyof typeof ApprovalStatus];

/** Expense approval statuses */
export const ExpenseStatus = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
} as const;
export type ExpenseStatusValue = typeof ExpenseStatus[keyof typeof ExpenseStatus];

/** Payment statuses */
export const PaymentStatus = {
  UNPAID: 'unpaid',
  PENDING: 'pending',
  PAID: 'paid',
  REJECTED: 'rejected',
} as const;
export type PaymentStatusValue = typeof PaymentStatus[keyof typeof PaymentStatus];

/** Settlement statuses */
export const SettlementStatus = {
  PENDING: 'pending',
  CONFIRMED: 'confirmed',
  REJECTED: 'rejected',
} as const;
export type SettlementStatusValue = typeof SettlementStatus[keyof typeof SettlementStatus];

/** Transaction types */
export const TransactionType = {
  COLLECTION: 'collection',
  EXPENSE: 'expense',
  RESET_REQUEST: 'reset_request',
  PAYOUT_REQUEST: 'payout_request',
} as const;
export type TransactionTypeValue = typeof TransactionType[keyof typeof TransactionType];

/** Location / machine statuses */
export const LocationStatus = {
  ACTIVE: 'active',
  MAINTENANCE: 'maintenance',
  BROKEN: 'broken',
} as const;
export type LocationStatusValue = typeof LocationStatus[keyof typeof LocationStatus];

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
  GEMINI_KEY_STORAGE: 'bahati_gemini_key',
  STORAGE_NOTIFICATIONS_KEY: 'kiosk_notifications',
  IMAGE_MAX_WIDTH: 800, 
  IMAGE_QUALITY: 0.6,
  STAGNANT_DAYS_THRESHOLD: 7,
};

// Re-export TRANSLATIONS from i18n module for backward compatibility
export { TRANSLATIONS } from './i18n';

/**
 * Safely reads any field from a Location by key name.
 * Avoids repeated `as unknown as Record<string, unknown>` casts at call sites.
 */
export function getLocationField(loc: Location, key: string): unknown {
  return (loc as unknown as Record<string, unknown>)[key];
}

export function getDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3;
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
