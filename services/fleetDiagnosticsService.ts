/**
 * fleetDiagnosticsService.ts
 *
 * Stage-6: aggregated fleet-wide queue diagnostics data source.
 *
 * Reads from the `queue_health_reports` Supabase table that driver devices
 * upsert to after each successful sync (see `reportQueueHealthToServer` in
 * offlineQueue.ts).  This is the server-side complement to the browser-local
 * `QueueDiagnostics` component — it shows health across all drivers/devices,
 * not just the current browser.
 *
 * This module is read-only and makes no writes.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import type { DeadLetterSummaryItem } from '../offlineQueue';

// Re-export so consumers only need to import from this module.
export type { DeadLetterSummaryItem };

/** One device's reported queue state, as stored in `queue_health_reports`. */
export interface DeviceQueueSnapshot {
  /** Row primary key: `{deviceId}--{driverId}` */
  id: string;
  deviceId: string;
  driverId: string;
  driverName: string;
  pendingCount: number;
  retryWaitingCount: number;
  deadLetterCount: number;
  deadLetterItems: DeadLetterSummaryItem[];
  /** ISO-8601 timestamp of the most recent report from this device. */
  reportedAt: string;
}

/** Aggregated fleet-wide summary returned by `getFleetDiagnostics`. */
export interface FleetDiagnosticsSummary {
  /** Number of distinct device+driver pairs that have ever reported. */
  totalDevicesReporting: number;
  /** Sum of pending counts across all reporting devices. */
  totalPending: number;
  /** Sum of retry-waiting counts across all reporting devices. */
  totalRetryWaiting: number;
  /** Sum of dead-letter counts across all reporting devices. */
  totalDeadLetter: number;
  /** Full per-device snapshot list, newest-first by reportedAt. */
  snapshots: DeviceQueueSnapshot[];
  /** ISO-8601 timestamp of when this summary was fetched. */
  fetchedAt: string;
}

/**
 * Fetches aggregated queue health across all reporting driver devices.
 *
 * Queries the `queue_health_reports` table which requires admin role
 * (enforced by Supabase RLS).
 *
 * @throws Error when the Supabase query itself fails (network error, auth).
 *         Returns an empty summary with zero counts on an empty table.
 */
export async function getFleetDiagnostics(
  supabaseClient: SupabaseClient,
): Promise<FleetDiagnosticsSummary> {
  const { data, error } = await supabaseClient
    .from('queue_health_reports')
    .select('*')
    .order('reported_at', { ascending: false });

  if (error) {
    throw new Error(`Fleet diagnostics query failed: ${error.message}`);
  }

  const rows: Array<Record<string, unknown>> = data ?? [];

  const snapshots: DeviceQueueSnapshot[] = rows.map((row) => ({
    id: String(row['id'] ?? ''),
    deviceId: String(row['device_id'] ?? ''),
    driverId: String(row['driver_id'] ?? ''),
    driverName: String(row['driver_name'] ?? ''),
    pendingCount: Number(row['pending_count'] ?? 0),
    retryWaitingCount: Number(row['retry_waiting_count'] ?? 0),
    deadLetterCount: Number(row['dead_letter_count'] ?? 0),
    deadLetterItems: Array.isArray(row['dead_letter_items'])
      ? (row['dead_letter_items'] as DeadLetterSummaryItem[])
      : [],
    reportedAt: String(row['reported_at'] ?? ''),
  }));

  return {
    totalDevicesReporting: snapshots.length,
    totalPending: snapshots.reduce((acc, s) => acc + s.pendingCount, 0),
    totalRetryWaiting: snapshots.reduce((acc, s) => acc + s.retryWaitingCount, 0),
    totalDeadLetter: snapshots.reduce((acc, s) => acc + s.deadLetterCount, 0),
    snapshots,
    fetchedAt: new Date().toISOString(),
  };
}
