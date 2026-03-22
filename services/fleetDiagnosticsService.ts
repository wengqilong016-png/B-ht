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

/**
 * Snapshots older than this threshold are considered stale.
 * Exported so the UI can apply the same threshold without duplicating magic numbers.
 */
export const STALE_THRESHOLD_MS = 2 * 60 * 60 * 1000; // 2 hours

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
  /**
   * True when `reportedAt` is older than `STALE_THRESHOLD_MS`.
   * Stale snapshots may no longer reflect current device queue state.
   */
  isStale: boolean;
}

/** Aggregated fleet-wide summary returned by `getFleetDiagnostics`. */
export interface FleetDiagnosticsSummary {
  /**
   * Totals computed across **current** (non-stale) snapshots only.
   * These represent the best estimate of live fleet queue health.
   */
  currentDevicesReporting: number;
  currentPending: number;
  currentRetryWaiting: number;
  currentDeadLetter: number;

  /**
   * Totals computed across **all** snapshots (current + stale).
   * Stale snapshots may overstate queue sizes for offline/reset devices.
   */
  totalDevicesReporting: number;
  totalPending: number;
  totalRetryWaiting: number;
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
    .select(
      'id, device_id, driver_id, driver_name, pending_count, retry_waiting_count, dead_letter_count, dead_letter_items, reported_at',
    )
    .order('reported_at', { ascending: false });

  if (error) {
    throw new Error(`Fleet diagnostics query failed: ${error.message}`);
  }

  const rows: Array<Record<string, unknown>> = data ?? [];
  const now = Date.now();

  const snapshots: DeviceQueueSnapshot[] = rows.map((row) => {
    const reportedAt = String(row['reported_at'] ?? '');
    const isStale = reportedAt
      ? now - new Date(reportedAt).getTime() > STALE_THRESHOLD_MS
      : true;
    return {
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
      reportedAt,
      isStale,
    };
  });

  const currentSnapshots = snapshots.filter((s) => !s.isStale);

  return {
    currentDevicesReporting: currentSnapshots.length,
    currentPending: currentSnapshots.reduce((acc, s) => acc + s.pendingCount, 0),
    currentRetryWaiting: currentSnapshots.reduce((acc, s) => acc + s.retryWaitingCount, 0),
    currentDeadLetter: currentSnapshots.reduce((acc, s) => acc + s.deadLetterCount, 0),
    totalDevicesReporting: snapshots.length,
    totalPending: snapshots.reduce((acc, s) => acc + s.pendingCount, 0),
    totalRetryWaiting: snapshots.reduce((acc, s) => acc + s.retryWaitingCount, 0),
    totalDeadLetter: snapshots.reduce((acc, s) => acc + s.deadLetterCount, 0),
    snapshots,
    fetchedAt: new Date().toISOString(),
  };
}
