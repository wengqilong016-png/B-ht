export interface Driver {
  id: string;
  name: string;
  username: string;
  phone: string;
  remainingDebt: number;
  dailyFloatingCoins: number;
  status: 'active' | 'inactive';
  currentGps?: { lat: number; lng: number };
}

export interface Location {
  id: string;
  name: string;
  machineId: string;
  lastScore: number;
  area: string;
  assignedDriverId?: string;
  coords?: { lat: number; lng: number };
  commissionRate: number;
  status: 'active' | 'maintenance' | 'broken';
}

export interface Transaction {
  id: string;
  timestamp: string;
  locationId: string;
  locationName: string;
  driverId: string;
  driverName: string;
  previousScore: number;
  currentScore: number;
  revenue: number;
  commission: number;
  netPayable: number;
  expenses: number;
  coinExchange: number;
  notes?: string;
  gps?: { lat: number; lng: number };
  isSynced: boolean;
  localId?: string;
}

export const COIN_VALUE_TZS = 200;

export function safeRandomUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    try {
      return crypto.randomUUID();
    } catch {
      // fall through
    }
  }
  // Fallback for older browsers
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
