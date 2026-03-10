/**
 * types.ts - B-ht Core Type Definitions (Phase 5 Standard)
 * Synchronized with DOCS_DATABASE_SCHEMA.md
 */

// ─── Shared Common Types ──────────────────────────────────────────
export type AppRole = 'admin' | 'driver';
export type SeverityLevel = 'info' | 'warning' | 'critical';
export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'auto-approved';
export type TransactionType = 'collection' | 'expense' | 'reset_request' | 'payout_request';

export interface GpsCoords {
  lat: number;
  lng: number;
}

// ─── Entity: Profiles ─────────────────────────────────────────────
export interface Profile {
  auth_user_id: string;
  role: AppRole;
  display_name?: string;
  driver_id?: string;
  created_at: string;
  updated_at: string;
}

// ─── Entity: Drivers ──────────────────────────────────────────────
export interface Driver {
  id: string;
  name: string;
  username: string;
  phone?: string;
  status: 'active' | 'online' | 'idle' | 'offline' | 'abnormal';
  current_gps?: GpsCoords;
  last_active?: string;
  daily_floating_coins: number;
  vehicle_info?: {
    model: string;
    plate: string;
  };
  base_salary: number;
  commission_rate: number;
  is_active: boolean;
  is_synced: boolean;
}

// ─── Entity: Locations ────────────────────────────────────────────
export interface Location {
  id: string;
  name: string;
  machine_id: string;
  coords?: GpsCoords;
  area?: string;
  last_score: number;
  last_revenue_date?: string;
  commission_rate: number;
  status: 'active' | 'broken' | 'maintenance';
  reset_locked: boolean;
  dividend_balance: number;
  assigned_driver_id?: string;
  machine_photo_url?: string;
  owner_name?: string;
  is_synced: boolean;
  created_at: string;
}

// ─── Entity: Transactions ─────────────────────────────────────────
export interface Transaction {
  id: string;
  timestamp: string;
  location_id: string;
  location_name?: string; // Snapshot
  driver_id: string;
  driver_name?: string; // Snapshot
  previous_score: number;
  current_score: number;
  revenue: number;
  commission: number;
  owner_retention: number;
  expenses: number;
  coin_exchange: number;
  net_payable: number;
  gps?: GpsCoords;
  photo_url?: string;
  is_synced: boolean;
  is_anomaly: boolean;
  type: TransactionType;
  approval_status: ApprovalStatus;
  payout_amount?: number;
  expense_type?: 'public' | 'private';
  expense_category?: string;
  expense_status?: ApprovalStatus;
  notes?: string;
  ai_score?: number;
}

// ─── Entity: Daily Settlements ───────────────────────────────────
export interface DailySettlement {
  id: string;
  driver_id: string;
  date: string;
  actual_cash: number;
  actual_coins: number;
  expected_amount?: number;
  variance?: number;
  status: ApprovalStatus;
  is_synced: boolean;
  notes?: string;
  timestamp: string;
  check_in_at?: string;
  check_out_at?: string;
}

// ─── Entity: Notifications (Phase 5) ──────────────────────────────
export interface AppNotification {
  id: string;
  type: string;
  title: string;
  message: string;
  level: SeverityLevel;
  entity_type?: 'driver' | 'location' | 'transaction';
  entity_id?: string;
  driver_id?: string;
  location_id?: string;
  transaction_id?: string;
  is_read: boolean;
  cooldown_key?: string;
  route_target?: string;
  metadata?: any;
  created_at: string;
}

// ─── Helper Functions (Standardized) ─────────────────────────────
export const safeRandomUUID = (): string => {
  return crypto.randomUUID();
};
