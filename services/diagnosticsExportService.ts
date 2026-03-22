/**
 * diagnosticsExportService.ts
 *
 * Stage-7: support/export workflow for diagnostics data.
 *
 * Provides:
 *   - Typed export payload shapes for local and fleet diagnostics.
 *   - Builder functions that produce support-friendly, read-only summaries
 *     without exposing unnecessary raw data (no GPS, no photos, no finance
 *     details beyond what is needed for support triage).
 *   - Filter helpers for narrowing exports by driver, device, and error state.
 *   - A browser-side `triggerJSONDownload` utility.
 *
 * This module is intentionally read-only — it makes no writes to any store.
 */

import type { QueueHealthSummary, QueueMeta } from '../offlineQueue';
import type { Transaction } from '../types';
import type {
  FleetDiagnosticsSummary,
  DeviceQueueSnapshot,
  DeadLetterSummaryItem,
} from './fleetDiagnosticsService';

// ── Filter types ──────────────────────────────────────────────────────────────

/**
 * Optional filters applied when building an export payload.
 * All filters are additive (AND-ed together).
 */
export interface ExportFilters {
  /** Only include items belonging to this driver ID. */
  driverId?: string;
  /** Only include items from this device ID. Fleet exports only. */
  deviceId?: string;
  /**
   * Filter by error state:
   *   'dead-letter'  – items that have exhausted all retries.
   *   'transient'    – items whose last error was transient.
   *   'permanent'    – items whose last error was permanent.
   *   'any-error'    – items with any recorded error (transient or permanent).
   */
  errorState?: 'dead-letter' | 'transient' | 'permanent' | 'any-error';
}

// ── Local export payload ──────────────────────────────────────────────────────

/** One dead-letter entry in a local export — safe subset for support handoff. */
export interface LocalDeadLetterEntry {
  txId: string;
  operationId?: string;
  driverId: string;
  driverName: string;
  locationId: string;
  locationName: string;
  retryCount: number;
  lastError?: string;
  lastErrorCategory?: 'transient' | 'permanent';
  nextRetryAt?: string;
  queuedAt?: string;
}

/** Top-level payload produced by `buildLocalExportPayload`. */
export interface LocalExportPayload {
  /** Schema version to allow consumers to handle future payload shape changes. */
  schemaVersion: 1;
  exportedAt: string;
  /** Scope label — always 'local' for this payload. */
  scope: 'local';
  /** Filters that were applied when building this export (undefined = none). */
  filtersApplied?: ExportFilters;
  summary: QueueHealthSummary;
  deadLetterItems: LocalDeadLetterEntry[];
  /** Informational: total dead-letter items before filters were applied. */
  totalDeadLetterBeforeFilter: number;
}

// ── Fleet export payload ──────────────────────────────────────────────────────

/** One device snapshot entry in a fleet export — safe subset for support handoff. */
export interface FleetDeviceEntry {
  deviceId: string;
  driverId: string;
  driverName: string;
  pendingCount: number;
  retryWaitingCount: number;
  deadLetterCount: number;
  isStale: boolean;
  reportedAt: string;
  deadLetterItems: DeadLetterSummaryItem[];
}

/** Top-level payload produced by `buildFleetExportPayload`. */
export interface FleetExportPayload {
  schemaVersion: 1;
  exportedAt: string;
  /** Scope label — always 'fleet' for this payload. */
  scope: 'fleet';
  filtersApplied?: ExportFilters;
  summary: {
    totalDevicesReporting: number;
    currentDevicesReporting: number;
    totalPending: number;
    currentPending: number;
    totalRetryWaiting: number;
    currentRetryWaiting: number;
    totalDeadLetter: number;
    currentDeadLetter: number;
    /** How many stale snapshots are included. */
    staleSnapshotCount: number;
    /** Source summary fetchedAt timestamp. */
    dataFetchedAt: string;
  };
  /** Per-device entries after filters have been applied. */
  devices: FleetDeviceEntry[];
  /** Total device count before filters were applied. */
  totalDevicesBeforeFilter: number;
}

// ── Filter helpers ────────────────────────────────────────────────────────────

/**
 * Filter a list of local dead-letter entries.
 * Returns a new array; never mutates the input.
 */
export function applyLocalFilters(
  items: Array<Transaction & Partial<QueueMeta>>,
  filters: ExportFilters,
): Array<Transaction & Partial<QueueMeta>> {
  return items.filter((item) => {
    if (filters.driverId && item.driverId !== filters.driverId) return false;
    if (filters.errorState) {
      switch (filters.errorState) {
        case 'transient':
          if (item.lastErrorCategory !== 'transient') return false;
          break;
        case 'permanent':
          if (item.lastErrorCategory !== 'permanent') return false;
          break;
        case 'any-error':
          if (!item.lastError) return false;
          break;
        // 'dead-letter' — all items passed in are already dead-letter; nothing to filter
        case 'dead-letter':
          break;
      }
    }
    return true;
  });
}

/**
 * Filter a list of fleet device snapshots.
 * Returns a new array; never mutates the input.
 */
export function applyFleetSnapshotFilters(
  snapshots: DeviceQueueSnapshot[],
  filters: ExportFilters,
): DeviceQueueSnapshot[] {
  return snapshots.filter((snap) => {
    if (filters.driverId && snap.driverId !== filters.driverId) return false;
    if (filters.deviceId && snap.deviceId !== filters.deviceId) return false;
    if (filters.errorState) {
      switch (filters.errorState) {
        case 'dead-letter':
        case 'any-error':
          if (snap.deadLetterCount === 0) return false;
          break;
        case 'transient':
          if (!snap.deadLetterItems.some((i) => i.lastErrorCategory === 'transient')) return false;
          break;
        case 'permanent':
          if (!snap.deadLetterItems.some((i) => i.lastErrorCategory === 'permanent')) return false;
          break;
      }
    }
    return true;
  });
}

// ── Payload builders ──────────────────────────────────────────────────────────

/**
 * Build a support-friendly local export payload from the current dead-letter
 * items and queue health summary.
 *
 * The exported payload strips GPS coordinates and all finance fields,
 * retaining only fields useful for support triage.
 *
 * @param deadLetterItems  Items returned by `getDeadLetterItems()`.
 * @param summary          Current queue health summary from `getQueueHealthSummary()`.
 * @param filters          Optional filters to narrow the export.
 */
export function buildLocalExportPayload(
  deadLetterItems: Array<Transaction & Partial<QueueMeta>>,
  summary: QueueHealthSummary,
  filters?: ExportFilters,
): LocalExportPayload {
  const totalDeadLetterBeforeFilter = deadLetterItems.length;
  const filtered = filters ? applyLocalFilters(deadLetterItems, filters) : deadLetterItems;

  const entries: LocalDeadLetterEntry[] = filtered.map((item) => ({
    txId: item.id,
    ...(item.operationId !== undefined ? { operationId: item.operationId } : {}),
    driverId: item.driverId ?? '',
    driverName: item.driverName ?? '',
    locationId: item.locationId ?? '',
    locationName: item.locationName ?? '',
    retryCount: item.retryCount ?? 0,
    ...(item.lastError !== undefined ? { lastError: item.lastError } : {}),
    ...(item.lastErrorCategory !== undefined ? { lastErrorCategory: item.lastErrorCategory } : {}),
    ...(item.nextRetryAt !== undefined ? { nextRetryAt: item.nextRetryAt } : {}),
    ...(item._queuedAt !== undefined ? { queuedAt: item._queuedAt } : {}),
  }));

  return {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    scope: 'local',
    ...(filters ? { filtersApplied: filters } : {}),
    summary,
    deadLetterItems: entries,
    totalDeadLetterBeforeFilter,
  };
}

/**
 * Build a support-friendly fleet export payload from the aggregated fleet
 * diagnostics summary.
 *
 * @param fleetSummary  Result from `getFleetDiagnostics()`.
 * @param filters       Optional filters to narrow by driver, device, or error state.
 */
export function buildFleetExportPayload(
  fleetSummary: FleetDiagnosticsSummary,
  filters?: ExportFilters,
): FleetExportPayload {
  const totalDevicesBeforeFilter = fleetSummary.snapshots.length;
  const filteredSnapshots = filters
    ? applyFleetSnapshotFilters(fleetSummary.snapshots, filters)
    : fleetSummary.snapshots;

  const staleSnapshotCount = filteredSnapshots.filter((s) => s.isStale).length;

  const devices: FleetDeviceEntry[] = filteredSnapshots.map((snap) => ({
    deviceId: snap.deviceId,
    driverId: snap.driverId,
    driverName: snap.driverName,
    pendingCount: snap.pendingCount,
    retryWaitingCount: snap.retryWaitingCount,
    deadLetterCount: snap.deadLetterCount,
    isStale: snap.isStale,
    reportedAt: snap.reportedAt,
    deadLetterItems: snap.deadLetterItems,
  }));

  return {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    scope: 'fleet',
    ...(filters ? { filtersApplied: filters } : {}),
    summary: {
      totalDevicesReporting: fleetSummary.totalDevicesReporting,
      currentDevicesReporting: fleetSummary.currentDevicesReporting,
      totalPending: fleetSummary.totalPending,
      currentPending: fleetSummary.currentPending,
      totalRetryWaiting: fleetSummary.totalRetryWaiting,
      currentRetryWaiting: fleetSummary.currentRetryWaiting,
      totalDeadLetter: fleetSummary.totalDeadLetter,
      currentDeadLetter: fleetSummary.currentDeadLetter,
      staleSnapshotCount,
      dataFetchedAt: fleetSummary.fetchedAt,
    },
    devices,
    totalDevicesBeforeFilter,
  };
}

// ── Download helper ───────────────────────────────────────────────────────────

/**
 * Trigger a browser-side JSON file download.
 *
 * Safe to call in any browser context; no-ops if `document` is not available
 * (e.g. in Node / test environments).
 *
 * @param payload   Any serialisable value — will be pretty-printed as JSON.
 * @param filename  Suggested filename for the download.
 */
export function triggerJSONDownload(payload: unknown, filename: string): void {
  if (typeof document === 'undefined') return;
  const json = JSON.stringify(payload, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

/**
 * Generate a timestamped filename for a diagnostics export.
 *
 * @param scope      'local' | 'fleet'
 * @param isoString  ISO-8601 timestamp (defaults to current time).
 */
export function buildExportFilename(scope: 'local' | 'fleet', isoString?: string): string {
  const ts = (isoString ?? new Date().toISOString())
    .replace(/:/g, '-')
    .replace(/\..+$/, '');
  return `bahati-diagnostics-${scope}-${ts}.json`;
}
