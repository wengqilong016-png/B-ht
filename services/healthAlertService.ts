/**
 * healthAlertService.ts
 *
 * Stage-8: background health alert generation and persistence.
 *
 * Two complementary paths:
 *
 *   1. Server-side (background):
 *      The `generate_health_alerts()` SQL function (see migration
 *      20260322200000_health_alerts.sql) runs every 15 minutes via pg_cron.
 *      It reads `queue_health_reports`, applies the same threshold logic,
 *      and upserts active alerts into the `health_alerts` table.  Alerts
 *      are resolved automatically when the triggering condition clears.
 *
 *   2. Client-side (read):
 *      `fetchPersistedAlerts()` reads the `health_alerts` table so the
 *      admin UI always shows alerts that were generated in the background,
 *      not just on the current page-view.
 *
 *   3. Pure helper (tests / server function parity):
 *      `generateAlertsFromSnapshots()` remains a side-effect-free function
 *      used in tests and to keep client logic aligned with the SQL thresholds.
 *
 * Alert types
 * ───────────
 *   dead_letter_items   – one or more items are stuck in dead-letter (critical)
 *   stale_snapshot      – device hasn't reported for > STALE_THRESHOLD_MS (warning)
 *   high_retry_waiting  – too many items are waiting for retry (warning)
 *   high_pending        – large pending backlog (info)
 *
 * Thresholds are exported so the UI can display them without duplicating
 * magic numbers.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { DeviceQueueSnapshot } from './fleetDiagnosticsService';

// ── Types ─────────────────────────────────────────────────────────────────────

export type AlertSeverity = 'critical' | 'warning' | 'info';

export type AlertType =
  | 'dead_letter_items'
  | 'stale_snapshot'
  | 'high_retry_waiting'
  | 'high_pending';

export interface HealthAlert {
  /** Deterministic id: `${type}--${snapshotId}` */
  id: string;
  type: AlertType;
  severity: AlertSeverity;
  deviceId: string;
  driverId: string;
  driverName: string;
  /** Human-readable description of the alert condition. */
  message: string;
  /** ISO-8601 timestamp when the alert was generated. */
  detectedAt: string;
}

// ── Thresholds ────────────────────────────────────────────────────────────────

/** Any device with at least this many dead-letter items fires a critical alert. */
export const DEAD_LETTER_ALERT_THRESHOLD = 1;

/** Devices with more than this many retry-waiting items trigger a warning. */
export const HIGH_RETRY_WAITING_THRESHOLD = 5;

/** Devices with more than this many pending items trigger an info alert. */
export const HIGH_PENDING_THRESHOLD = 20;

/** Severity ordering used for sorting in both `generateAlertsFromSnapshots` and `fetchPersistedAlerts`. */
const SEVERITY_ORDER: Record<AlertSeverity, number> = { critical: 0, warning: 1, info: 2 };

// ── Core generation function ──────────────────────────────────────────────────

/**
 * Derives a list of {@link HealthAlert}s from an array of device snapshots.
 *
 * The result is sorted by severity (critical → warning → info) then by
 * driverName so the most actionable alerts appear first.
 *
 * This function is pure: it has no side effects and does not contact Supabase.
 */
export function generateAlertsFromSnapshots(
  snapshots: DeviceQueueSnapshot[],
): HealthAlert[] {
  const alerts: HealthAlert[] = [];
  const detectedAt = new Date().toISOString();

  for (const snapshot of snapshots) {
    const { id, deviceId, driverId, driverName, deadLetterCount, retryWaitingCount, pendingCount, isStale, reportedAt } = snapshot;

    // Dead-letter alert (critical) ─────────────────────────────────────────
    if (deadLetterCount >= DEAD_LETTER_ALERT_THRESHOLD) {
      alerts.push({
        id: `dead_letter_items--${id}`,
        type: 'dead_letter_items',
        severity: 'critical',
        deviceId,
        driverId,
        driverName,
        message:
          `${driverName}: ${deadLetterCount} dead-letter item${deadLetterCount !== 1 ? 's' : ''} — manual replay required`,
        detectedAt,
      });
    }

    // Stale snapshot alert (warning) ───────────────────────────────────────
    if (isStale) {
      alerts.push({
        id: `stale_snapshot--${id}`,
        type: 'stale_snapshot',
        severity: 'warning',
        deviceId,
        driverId,
        driverName,
        message:
          `${driverName}: snapshot is stale (last seen ${formatAge(reportedAt)}) — device may be offline`,
        detectedAt,
      });
    }

    // High retry-waiting alert (warning) ───────────────────────────────────
    if (retryWaitingCount > HIGH_RETRY_WAITING_THRESHOLD) {
      alerts.push({
        id: `high_retry_waiting--${id}`,
        type: 'high_retry_waiting',
        severity: 'warning',
        deviceId,
        driverId,
        driverName,
        message:
          `${driverName}: ${retryWaitingCount} items waiting to retry — check connectivity`,
        detectedAt,
      });
    }

    // High pending alert (info) ────────────────────────────────────────────
    if (pendingCount > HIGH_PENDING_THRESHOLD) {
      alerts.push({
        id: `high_pending--${id}`,
        type: 'high_pending',
        severity: 'info',
        deviceId,
        driverId,
        driverName,
        message:
          `${driverName}: ${pendingCount} items pending sync`,
        detectedAt,
      });
    }
  }

  // Sort: critical first, warning second, info last; within tier sort by driver name
  alerts.sort((a, b) => {
    const sev = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    return sev !== 0 ? sev : a.driverName.localeCompare(b.driverName);
  });

  return alerts;
}

// ── Persisted alert reader ────────────────────────────────────────────────────

/**
 * Fetches active (unresolved) health alerts from the `health_alerts` table.
 *
 * Alerts in this table are written by the `generate_health_alerts()` SQL
 * function which runs every 15 minutes via pg_cron — they exist independently
 * of whether any admin has the HealthAlerts page open.
 *
 * Returns alerts sorted by severity (critical → warning → info) then by
 * driverName, matching the ordering of `generateAlertsFromSnapshots`.
 *
 * Requires admin role (enforced by Supabase RLS on `health_alerts`).
 *
 * @throws Error when the Supabase query fails (network error, auth).
 */
export async function fetchPersistedAlerts(
  supabaseClient: SupabaseClient,
): Promise<HealthAlert[]> {
  const { data, error } = await supabaseClient
    .from('health_alerts')
    .select('id, alert_type, severity, device_id, driver_id, driver_name, message, detected_at')
    .is('resolved_at', null)
    .order('detected_at', { ascending: false });

  if (error) {
    throw new Error(`Health alerts query failed: ${error.message}`);
  }

  const rows: Array<Record<string, unknown>> = data ?? [];

  const alerts: HealthAlert[] = rows.map((row) => ({
    id: String(row['id'] ?? ''),
    type: String(row['alert_type'] ?? '') as AlertType,
    severity: String(row['severity'] ?? '') as AlertSeverity,
    deviceId: String(row['device_id'] ?? ''),
    driverId: String(row['driver_id'] ?? ''),
    driverName: String(row['driver_name'] ?? ''),
    message: String(row['message'] ?? ''),
    detectedAt: String(row['detected_at'] ?? ''),
  }));

  // Re-apply client-side sort so callers don't depend on DB ordering.
  alerts.sort((a, b) => {
    const sev = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    return sev !== 0 ? sev : a.driverName.localeCompare(b.driverName);
  });

  return alerts;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Returns a human-readable relative age string (e.g. "2h 15m ago"). */
function formatAge(iso: string): string {
  if (!iso) return 'unknown';
  const diffMs = Date.now() - new Date(iso).getTime();
  if (diffMs < 0) return 'just now';
  const totalSeconds = Math.floor(diffMs / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s ago`;
  const totalMinutes = Math.floor(totalSeconds / 60);
  if (totalMinutes < 60) return `${totalMinutes}m ago`;
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h < 24) return m > 0 ? `${h}h ${m}m ago` : `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
