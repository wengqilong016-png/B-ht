/**
 * maps/shared/mapTypes.ts
 * Core types for the Phase 4 Map Audit System.
 */

export interface DriverTrackPoint {
  driverId: string;
  lat: number;
  lng: number;
  timestamp: string; // ISO string preferred
  source: 'heartbeat' | 'transaction' | 'manual' | 'estimated';
  accuracy?: number;
}

export interface MapAuditState {
  selectedDriverId?: string;
  startDate?: string;
  endDate?: string;
  showRiskLayer: boolean;
  showMachineLayer: boolean;
  showDriverTrack: boolean;
}
