/**
 * __tests__/diagnosticsExport.test.ts
 *
 * Stage-7: focused tests for the diagnostics export/filter workflow.
 *
 * Coverage:
 *   buildLocalExportPayload
 *     - Returns correct schema shape with no filters
 *     - Strips GPS and finance fields from entries
 *     - Filters by driverId
 *     - Filters by errorState (transient / permanent / any-error / dead-letter)
 *     - Records totalDeadLetterBeforeFilter when filters reduce the list
 *     - Includes filtersApplied only when filters are provided
 *
 *   buildFleetExportPayload
 *     - Returns correct schema shape with no filters
 *     - Filters snapshots by driverId
 *     - Filters snapshots by deviceId
 *     - Filters snapshots by errorState (dead-letter / transient / permanent / any-error)
 *     - Records totalDevicesBeforeFilter when filters reduce the list
 *     - Payload summary reflects filtered device list
 *
 *   applyLocalFilters
 *     - No filters: returns all items unchanged
 *     - driverId filter removes non-matching items
 *     - errorState=transient keeps only transient items
 *     - errorState=permanent keeps only permanent items
 *     - errorState=any-error keeps only items with a lastError
 *     - errorState=dead-letter keeps all items (all are dead-letter by definition)
 *
 *   applyFleetSnapshotFilters
 *     - No filters: returns all snapshots
 *     - driverId filter
 *     - deviceId filter
 *     - Combined driverId + deviceId
 *     - errorState=dead-letter / any-error filter by deadLetterCount > 0
 *     - errorState=transient filters by presence of transient dead-letter items
 *     - errorState=permanent filters by presence of permanent dead-letter items
 *
 *   buildExportFilename
 *     - Produces expected pattern for local scope
 *     - Produces expected pattern for fleet scope
 *     - Strips colons and fractional seconds from ISO timestamp
 */

import { describe, it, expect } from '@jest/globals';
import {
  buildLocalExportPayload,
  buildFleetExportPayload,
  applyLocalFilters,
  applyFleetSnapshotFilters,
  buildExportFilename,
  type ExportFilters,
  type LocalExportPayload,
  type FleetExportPayload,
} from '../services/diagnosticsExportService';
import type { QueueHealthSummary, QueueMeta } from '../offlineQueue';
import type { Transaction } from '../types';
import type { FleetDiagnosticsSummary, DeviceQueueSnapshot } from '../services/fleetDiagnosticsService';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeDeadLetterTx(overrides: Partial<Transaction & QueueMeta> = {}): Transaction & QueueMeta {
  return {
    id: `tx-${Math.random().toString(36).slice(2)}`,
    timestamp: new Date().toISOString(),
    locationId: 'loc-1',
    locationName: 'Test Location',
    driverId: 'drv-1',
    driverName: 'Driver One',
    previousScore: 100,
    currentScore: 200,
    revenue: 20000,
    commission: 3000,
    ownerRetention: 3000,
    debtDeduction: 0,
    startupDebtDeduction: 0,
    expenses: 0,
    coinExchange: 0,
    extraIncome: 0,
    netPayable: 17000,
    gps: { lat: -6.8, lng: 39.3 },
    dataUsageKB: 10,
    isSynced: false,
    type: 'collection',
    operationId: `op-${Math.random().toString(36).slice(2)}`,
    entityVersion: 1,
    _queuedAt: new Date().toISOString(),
    retryCount: 5,
    lastError: 'Network request failed',
    lastErrorCategory: 'transient',
    ...overrides,
  } as Transaction & QueueMeta;
}

function makeHealthSummary(overrides: Partial<QueueHealthSummary> = {}): QueueHealthSummary {
  return { pending: 0, retryWaiting: 0, deadLetter: 1, ...overrides };
}

function makeSnapshot(overrides: Partial<DeviceQueueSnapshot> = {}): DeviceQueueSnapshot {
  return {
    id: 'dev-abc--drv-1',
    deviceId: 'dev-abc',
    driverId: 'drv-1',
    driverName: 'Driver One',
    pendingCount: 0,
    retryWaitingCount: 0,
    deadLetterCount: 1,
    deadLetterItems: [
      {
        txId: 'tx-1',
        retryCount: 5,
        locationId: 'loc-1',
        locationName: 'Shop A',
        lastError: 'Location not found',
        lastErrorCategory: 'permanent',
      },
    ],
    reportedAt: new Date().toISOString(),
    isStale: false,
    ...overrides,
  };
}

function makeFleetSummary(snapshots: DeviceQueueSnapshot[]): FleetDiagnosticsSummary {
  const current = snapshots.filter((s) => !s.isStale);
  return {
    currentDevicesReporting: current.length,
    currentPending: current.reduce((a, s) => a + s.pendingCount, 0),
    currentRetryWaiting: current.reduce((a, s) => a + s.retryWaitingCount, 0),
    currentDeadLetter: current.reduce((a, s) => a + s.deadLetterCount, 0),
    totalDevicesReporting: snapshots.length,
    totalPending: snapshots.reduce((a, s) => a + s.pendingCount, 0),
    totalRetryWaiting: snapshots.reduce((a, s) => a + s.retryWaitingCount, 0),
    totalDeadLetter: snapshots.reduce((a, s) => a + s.deadLetterCount, 0),
    snapshots,
    fetchedAt: new Date().toISOString(),
  };
}

// ── buildLocalExportPayload ───────────────────────────────────────────────────

describe('buildLocalExportPayload', () => {
  it('returns correct top-level schema with no filters', () => {
    const items = [makeDeadLetterTx()];
    const summary = makeHealthSummary();
    const payload = buildLocalExportPayload(items, summary);

    expect(payload.schemaVersion).toBe(1);
    expect(payload.scope).toBe('local');
    expect(payload.exportedAt).toBeTruthy();
    expect(payload.filtersApplied).toBeUndefined();
    expect(payload.deadLetterItems).toHaveLength(1);
    expect(payload.totalDeadLetterBeforeFilter).toBe(1);
    expect(payload.summary).toEqual(summary);
  });

  it('strips GPS and finance fields from exported entries', () => {
    const tx = makeDeadLetterTx();
    const payload = buildLocalExportPayload([tx], makeHealthSummary());
    const entry = payload.deadLetterItems[0];

    // Fields that MUST be present for support triage
    expect(entry.txId).toBe(tx.id);
    expect(entry.driverId).toBe(tx.driverId);
    expect(entry.driverName).toBe(tx.driverName);
    expect(entry.locationId).toBe(tx.locationId);
    expect(entry.locationName).toBe(tx.locationName);
    expect(entry.retryCount).toBe(tx.retryCount);
    expect(entry.lastError).toBe(tx.lastError);
    expect(entry.lastErrorCategory).toBe(tx.lastErrorCategory);

    // Fields that MUST NOT be in the exported entry
    expect((entry as Record<string, unknown>)['gps']).toBeUndefined();
    expect((entry as Record<string, unknown>)['revenue']).toBeUndefined();
    expect((entry as Record<string, unknown>)['commission']).toBeUndefined();
    expect((entry as Record<string, unknown>)['netPayable']).toBeUndefined();
    expect((entry as Record<string, unknown>)['currentScore']).toBeUndefined();
    expect((entry as Record<string, unknown>)['previousScore']).toBeUndefined();
  });

  it('filters items by driverId', () => {
    const items = [
      makeDeadLetterTx({ id: 'tx-a', driverId: 'drv-1', driverName: 'Driver One' }),
      makeDeadLetterTx({ id: 'tx-b', driverId: 'drv-2', driverName: 'Driver Two' }),
      makeDeadLetterTx({ id: 'tx-c', driverId: 'drv-1', driverName: 'Driver One' }),
    ];
    const payload = buildLocalExportPayload(items, makeHealthSummary({ deadLetter: 3 }), { driverId: 'drv-1' });

    expect(payload.totalDeadLetterBeforeFilter).toBe(3);
    expect(payload.deadLetterItems).toHaveLength(2);
    expect(payload.deadLetterItems.every((e) => e.driverId === 'drv-1')).toBe(true);
    expect(payload.filtersApplied).toEqual({ driverId: 'drv-1' });
  });

  it('filters items by errorState=transient', () => {
    const items = [
      makeDeadLetterTx({ id: 'tx-a', lastErrorCategory: 'transient' }),
      makeDeadLetterTx({ id: 'tx-b', lastErrorCategory: 'permanent' }),
      makeDeadLetterTx({ id: 'tx-c', lastErrorCategory: 'transient' }),
    ];
    const payload = buildLocalExportPayload(items, makeHealthSummary({ deadLetter: 3 }), { errorState: 'transient' });

    expect(payload.totalDeadLetterBeforeFilter).toBe(3);
    expect(payload.deadLetterItems).toHaveLength(2);
    expect(payload.deadLetterItems.every((e) => e.lastErrorCategory === 'transient')).toBe(true);
  });

  it('filters items by errorState=permanent', () => {
    const items = [
      makeDeadLetterTx({ id: 'tx-a', lastErrorCategory: 'transient' }),
      makeDeadLetterTx({ id: 'tx-b', lastErrorCategory: 'permanent' }),
    ];
    const payload = buildLocalExportPayload(items, makeHealthSummary({ deadLetter: 2 }), { errorState: 'permanent' });

    expect(payload.deadLetterItems).toHaveLength(1);
    expect(payload.deadLetterItems[0].lastErrorCategory).toBe('permanent');
  });

  it('filters items by errorState=any-error: keeps only items with lastError set', () => {
    const items = [
      makeDeadLetterTx({ id: 'tx-a', lastError: 'something failed', lastErrorCategory: 'transient' }),
      makeDeadLetterTx({ id: 'tx-b', lastError: undefined, lastErrorCategory: undefined }),
    ];
    const payload = buildLocalExportPayload(items, makeHealthSummary({ deadLetter: 2 }), { errorState: 'any-error' });

    expect(payload.deadLetterItems).toHaveLength(1);
    expect(payload.deadLetterItems[0].txId).toBe('tx-a');
  });

  it('errorState=dead-letter returns all items unchanged (all are dead-letter)', () => {
    const items = [makeDeadLetterTx(), makeDeadLetterTx()];
    const payload = buildLocalExportPayload(items, makeHealthSummary({ deadLetter: 2 }), { errorState: 'dead-letter' });

    expect(payload.deadLetterItems).toHaveLength(2);
  });

  it('records totalDeadLetterBeforeFilter when filters reduce the list', () => {
    const items = [
      makeDeadLetterTx({ driverId: 'drv-1' }),
      makeDeadLetterTx({ driverId: 'drv-2' }),
      makeDeadLetterTx({ driverId: 'drv-1' }),
    ];
    const payload = buildLocalExportPayload(items, makeHealthSummary({ deadLetter: 3 }), { driverId: 'drv-1' });

    expect(payload.totalDeadLetterBeforeFilter).toBe(3);
    expect(payload.deadLetterItems).toHaveLength(2);
  });

  it('omits filtersApplied when no filters are provided', () => {
    const payload = buildLocalExportPayload([makeDeadLetterTx()], makeHealthSummary());
    expect(payload.filtersApplied).toBeUndefined();
  });

  it('includes operationId and queuedAt in entry when present', () => {
    const queuedAt = new Date().toISOString();
    const tx = makeDeadLetterTx({ operationId: 'op-xyz', _queuedAt: queuedAt });
    const payload = buildLocalExportPayload([tx], makeHealthSummary());
    expect(payload.deadLetterItems[0].operationId).toBe('op-xyz');
    expect(payload.deadLetterItems[0].queuedAt).toBe(queuedAt);
  });
});

// ── buildFleetExportPayload ───────────────────────────────────────────────────

describe('buildFleetExportPayload', () => {
  it('returns correct top-level schema with no filters', () => {
    const snapshots = [makeSnapshot(), makeSnapshot({ id: 'dev-def--drv-2', deviceId: 'dev-def', driverId: 'drv-2' })];
    const fleet = makeFleetSummary(snapshots);
    const payload = buildFleetExportPayload(fleet);

    expect(payload.schemaVersion).toBe(1);
    expect(payload.scope).toBe('fleet');
    expect(payload.exportedAt).toBeTruthy();
    expect(payload.filtersApplied).toBeUndefined();
    expect(payload.devices).toHaveLength(2);
    expect(payload.totalDevicesBeforeFilter).toBe(2);
    expect(payload.summary.totalDevicesReporting).toBe(2);
    expect(payload.summary.dataFetchedAt).toBe(fleet.fetchedAt);
  });

  it('filters snapshots by driverId', () => {
    const snapshots = [
      makeSnapshot({ id: 'dev-a--drv-1', deviceId: 'dev-a', driverId: 'drv-1' }),
      makeSnapshot({ id: 'dev-b--drv-2', deviceId: 'dev-b', driverId: 'drv-2' }),
    ];
    const fleet = makeFleetSummary(snapshots);
    const payload = buildFleetExportPayload(fleet, { driverId: 'drv-1' });

    expect(payload.totalDevicesBeforeFilter).toBe(2);
    expect(payload.devices).toHaveLength(1);
    expect(payload.devices[0].driverId).toBe('drv-1');
    expect(payload.filtersApplied).toEqual({ driverId: 'drv-1' });
  });

  it('filters snapshots by deviceId', () => {
    const snapshots = [
      makeSnapshot({ id: 'dev-a--drv-1', deviceId: 'dev-a', driverId: 'drv-1' }),
      makeSnapshot({ id: 'dev-b--drv-1', deviceId: 'dev-b', driverId: 'drv-1' }),
    ];
    const fleet = makeFleetSummary(snapshots);
    const payload = buildFleetExportPayload(fleet, { deviceId: 'dev-b' });

    expect(payload.devices).toHaveLength(1);
    expect(payload.devices[0].deviceId).toBe('dev-b');
  });

  it('filters by errorState=dead-letter to only devices with dead-letter count > 0', () => {
    const snapshots = [
      makeSnapshot({ id: 'a--drv-1', deviceId: 'a', deadLetterCount: 2 }),
      makeSnapshot({ id: 'b--drv-2', deviceId: 'b', deadLetterCount: 0, deadLetterItems: [] }),
    ];
    const fleet = makeFleetSummary(snapshots);
    const payload = buildFleetExportPayload(fleet, { errorState: 'dead-letter' });

    expect(payload.devices).toHaveLength(1);
    expect(payload.devices[0].deviceId).toBe('a');
  });

  it('filters by errorState=any-error same as dead-letter for fleet', () => {
    const snapshots = [
      makeSnapshot({ id: 'a--drv-1', deviceId: 'a', deadLetterCount: 1 }),
      makeSnapshot({ id: 'b--drv-2', deviceId: 'b', deadLetterCount: 0, deadLetterItems: [] }),
    ];
    const fleet = makeFleetSummary(snapshots);
    const payload = buildFleetExportPayload(fleet, { errorState: 'any-error' });

    expect(payload.devices).toHaveLength(1);
    expect(payload.devices[0].deviceId).toBe('a');
  });

  it('filters by errorState=transient: only snapshots with transient dead-letter items', () => {
    const snapshots = [
      makeSnapshot({
        id: 'a--drv-1', deviceId: 'a', deadLetterCount: 1,
        deadLetterItems: [{ txId: 'tx-1', retryCount: 5, locationId: 'loc-1', lastErrorCategory: 'transient' }],
      }),
      makeSnapshot({
        id: 'b--drv-2', deviceId: 'b', deadLetterCount: 1,
        deadLetterItems: [{ txId: 'tx-2', retryCount: 5, locationId: 'loc-2', lastErrorCategory: 'permanent' }],
      }),
    ];
    const fleet = makeFleetSummary(snapshots);
    const payload = buildFleetExportPayload(fleet, { errorState: 'transient' });

    expect(payload.devices).toHaveLength(1);
    expect(payload.devices[0].deviceId).toBe('a');
  });

  it('filters by errorState=permanent: only snapshots with permanent dead-letter items', () => {
    const snapshots = [
      makeSnapshot({
        id: 'a--drv-1', deviceId: 'a', deadLetterCount: 1,
        deadLetterItems: [{ txId: 'tx-1', retryCount: 5, locationId: 'loc-1', lastErrorCategory: 'transient' }],
      }),
      makeSnapshot({
        id: 'b--drv-2', deviceId: 'b', deadLetterCount: 1,
        deadLetterItems: [{ txId: 'tx-2', retryCount: 5, locationId: 'loc-2', lastErrorCategory: 'permanent' }],
      }),
    ];
    const fleet = makeFleetSummary(snapshots);
    const payload = buildFleetExportPayload(fleet, { errorState: 'permanent' });

    expect(payload.devices).toHaveLength(1);
    expect(payload.devices[0].deviceId).toBe('b');
  });

  it('combines driverId and deviceId filters (AND logic)', () => {
    const snapshots = [
      makeSnapshot({ id: 'a--drv-1', deviceId: 'dev-a', driverId: 'drv-1' }),
      makeSnapshot({ id: 'b--drv-1', deviceId: 'dev-b', driverId: 'drv-1' }),
      makeSnapshot({ id: 'a--drv-2', deviceId: 'dev-a', driverId: 'drv-2' }),
    ];
    const fleet = makeFleetSummary(snapshots);
    const payload = buildFleetExportPayload(fleet, { driverId: 'drv-1', deviceId: 'dev-a' });

    expect(payload.devices).toHaveLength(1);
    expect(payload.devices[0].driverId).toBe('drv-1');
    expect(payload.devices[0].deviceId).toBe('dev-a');
  });

  it('payload summary staleSnapshotCount reflects stale devices in filtered list', () => {
    const snapshots = [
      makeSnapshot({ id: 'fresh--drv-1', deviceId: 'fresh', isStale: false }),
      makeSnapshot({ id: 'stale--drv-2', deviceId: 'stale', isStale: true }),
    ];
    const fleet = makeFleetSummary(snapshots);
    const payload = buildFleetExportPayload(fleet);

    expect(payload.summary.staleSnapshotCount).toBe(1);
  });

  it('returns empty devices array when no snapshots match the filter', () => {
    const snapshots = [makeSnapshot({ driverId: 'drv-1' })];
    const fleet = makeFleetSummary(snapshots);
    const payload = buildFleetExportPayload(fleet, { driverId: 'drv-99' });

    expect(payload.devices).toHaveLength(0);
    expect(payload.totalDevicesBeforeFilter).toBe(1);
  });
});

// ── applyLocalFilters ─────────────────────────────────────────────────────────

describe('applyLocalFilters', () => {
  it('returns all items when filters object is empty', () => {
    const items = [makeDeadLetterTx(), makeDeadLetterTx()];
    expect(applyLocalFilters(items, {})).toHaveLength(2);
  });

  it('filters by driverId', () => {
    const items = [
      makeDeadLetterTx({ driverId: 'drv-1' }),
      makeDeadLetterTx({ driverId: 'drv-2' }),
    ];
    const result = applyLocalFilters(items, { driverId: 'drv-1' });
    expect(result).toHaveLength(1);
    expect(result[0].driverId).toBe('drv-1');
  });

  it('errorState=transient keeps transient items only', () => {
    const items = [
      makeDeadLetterTx({ lastErrorCategory: 'transient' }),
      makeDeadLetterTx({ lastErrorCategory: 'permanent' }),
    ];
    const result = applyLocalFilters(items, { errorState: 'transient' });
    expect(result).toHaveLength(1);
    expect(result[0].lastErrorCategory).toBe('transient');
  });

  it('errorState=permanent keeps permanent items only', () => {
    const items = [
      makeDeadLetterTx({ lastErrorCategory: 'transient' }),
      makeDeadLetterTx({ lastErrorCategory: 'permanent' }),
    ];
    const result = applyLocalFilters(items, { errorState: 'permanent' });
    expect(result).toHaveLength(1);
    expect(result[0].lastErrorCategory).toBe('permanent');
  });

  it('errorState=any-error keeps items with lastError defined', () => {
    const items = [
      makeDeadLetterTx({ lastError: 'some error' }),
      makeDeadLetterTx({ lastError: undefined }),
    ];
    const result = applyLocalFilters(items, { errorState: 'any-error' });
    expect(result).toHaveLength(1);
    expect(result[0].lastError).toBe('some error');
  });

  it('errorState=dead-letter returns all items', () => {
    const items = [makeDeadLetterTx(), makeDeadLetterTx()];
    expect(applyLocalFilters(items, { errorState: 'dead-letter' })).toHaveLength(2);
  });

  it('does not mutate the input array', () => {
    const items = [makeDeadLetterTx({ driverId: 'drv-1' }), makeDeadLetterTx({ driverId: 'drv-2' })];
    const original = [...items];
    applyLocalFilters(items, { driverId: 'drv-1' });
    expect(items).toHaveLength(original.length);
  });
});

// ── applyFleetSnapshotFilters ─────────────────────────────────────────────────

describe('applyFleetSnapshotFilters', () => {
  it('returns all snapshots when filters object is empty', () => {
    const snaps = [makeSnapshot(), makeSnapshot({ id: 'b--drv-2', deviceId: 'b', driverId: 'drv-2' })];
    expect(applyFleetSnapshotFilters(snaps, {})).toHaveLength(2);
  });

  it('filters by driverId', () => {
    const snaps = [
      makeSnapshot({ driverId: 'drv-1' }),
      makeSnapshot({ id: 'b--drv-2', deviceId: 'b', driverId: 'drv-2' }),
    ];
    const result = applyFleetSnapshotFilters(snaps, { driverId: 'drv-1' });
    expect(result).toHaveLength(1);
    expect(result[0].driverId).toBe('drv-1');
  });

  it('filters by deviceId', () => {
    const snaps = [
      makeSnapshot({ deviceId: 'dev-a' }),
      makeSnapshot({ id: 'dev-b--drv-2', deviceId: 'dev-b', driverId: 'drv-2' }),
    ];
    const result = applyFleetSnapshotFilters(snaps, { deviceId: 'dev-b' });
    expect(result).toHaveLength(1);
    expect(result[0].deviceId).toBe('dev-b');
  });

  it('applies both driverId and deviceId as AND', () => {
    const snaps = [
      makeSnapshot({ id: 'a--drv-1', deviceId: 'dev-a', driverId: 'drv-1' }),
      makeSnapshot({ id: 'b--drv-1', deviceId: 'dev-b', driverId: 'drv-1' }),
    ];
    const result = applyFleetSnapshotFilters(snaps, { driverId: 'drv-1', deviceId: 'dev-a' });
    expect(result).toHaveLength(1);
    expect(result[0].deviceId).toBe('dev-a');
  });

  it('errorState=dead-letter filters by deadLetterCount > 0', () => {
    const snaps = [
      makeSnapshot({ deviceId: 'a', deadLetterCount: 2 }),
      makeSnapshot({ id: 'b--drv-2', deviceId: 'b', driverId: 'drv-2', deadLetterCount: 0, deadLetterItems: [] }),
    ];
    expect(applyFleetSnapshotFilters(snaps, { errorState: 'dead-letter' })).toHaveLength(1);
    expect(applyFleetSnapshotFilters(snaps, { errorState: 'dead-letter' })[0].deviceId).toBe('a');
  });

  it('errorState=any-error filters by deadLetterCount > 0', () => {
    const snaps = [
      makeSnapshot({ deviceId: 'a', deadLetterCount: 1 }),
      makeSnapshot({ id: 'b--drv-2', deviceId: 'b', driverId: 'drv-2', deadLetterCount: 0, deadLetterItems: [] }),
    ];
    expect(applyFleetSnapshotFilters(snaps, { errorState: 'any-error' })).toHaveLength(1);
  });

  it('errorState=transient filters by transient dead-letter items', () => {
    const snaps = [
      makeSnapshot({
        deviceId: 'a', deadLetterItems: [{ txId: 'tx-1', retryCount: 5, locationId: 'l', lastErrorCategory: 'transient' }],
      }),
      makeSnapshot({
        id: 'b--drv-2', deviceId: 'b', driverId: 'drv-2',
        deadLetterItems: [{ txId: 'tx-2', retryCount: 5, locationId: 'l', lastErrorCategory: 'permanent' }],
      }),
    ];
    const result = applyFleetSnapshotFilters(snaps, { errorState: 'transient' });
    expect(result).toHaveLength(1);
    expect(result[0].deviceId).toBe('a');
  });

  it('errorState=permanent filters by permanent dead-letter items', () => {
    const snaps = [
      makeSnapshot({
        deviceId: 'a', deadLetterItems: [{ txId: 'tx-1', retryCount: 5, locationId: 'l', lastErrorCategory: 'transient' }],
      }),
      makeSnapshot({
        id: 'b--drv-2', deviceId: 'b', driverId: 'drv-2',
        deadLetterItems: [{ txId: 'tx-2', retryCount: 5, locationId: 'l', lastErrorCategory: 'permanent' }],
      }),
    ];
    const result = applyFleetSnapshotFilters(snaps, { errorState: 'permanent' });
    expect(result).toHaveLength(1);
    expect(result[0].deviceId).toBe('b');
  });

  it('does not mutate the input array', () => {
    const snaps = [makeSnapshot(), makeSnapshot({ id: 'b--drv-2', deviceId: 'b', driverId: 'drv-2' })];
    const original = [...snaps];
    applyFleetSnapshotFilters(snaps, { driverId: 'drv-1' });
    expect(snaps).toHaveLength(original.length);
  });
});

// ── buildExportFilename ───────────────────────────────────────────────────────

describe('buildExportFilename', () => {
  it('produces local scope filename with correct prefix', () => {
    const name = buildExportFilename('local', '2026-03-22T13:30:00.000Z');
    expect(name).toMatch(/^bahati-diagnostics-local-/);
    expect(name).toMatch(/\.json$/);
  });

  it('produces fleet scope filename with correct prefix', () => {
    const name = buildExportFilename('fleet', '2026-03-22T13:30:00.000Z');
    expect(name).toMatch(/^bahati-diagnostics-fleet-/);
  });

  it('strips colons from the ISO timestamp to be filesystem-safe', () => {
    const name = buildExportFilename('local', '2026-03-22T13:30:00.000Z');
    expect(name).not.toContain(':');
  });

  it('strips fractional seconds from filename', () => {
    const name = buildExportFilename('fleet', '2026-03-22T13:30:00.000Z');
    // The .000 fractional seconds and trailing Z should be stripped
    expect(name).not.toContain('.000');
    // But still ends in .json
    expect(name.endsWith('.json')).toBe(true);
  });

  it('uses current time when no isoString is provided', () => {
    const name = buildExportFilename('fleet');
    expect(name).toMatch(/^bahati-diagnostics-fleet-\d{4}/);
  });
});
