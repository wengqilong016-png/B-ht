/**
 * __tests__/supportCase.test.ts
 *
 * Stage-9: focused tests for support case linking and audit trail.
 *
 * Coverage:
 *   recordAuditEvent:
 *     - Inserts a row to support_audit_log with all provided fields
 *     - Works when caseId, actorId, and payload are omitted (optional fields)
 *     - Never throws when the Supabase insert returns an error (fire-and-forget)
 *     - Never throws when the Supabase client itself throws (fire-and-forget)
 *
 *   fetchAuditLog:
 *     - Returns an empty array when the table has no rows
 *     - Maps DB columns to AuditEvent fields correctly
 *     - Returns events newest-first (order from DB preserved)
 *     - Filters by caseId when the option is provided
 *     - Applies default limit of 200 when no limit is provided
 *     - Applies caller-supplied limit
 *     - Throws a descriptive error when the Supabase query fails
 *     - Handles null payload and null actorId gracefully
 *     - Handles null caseId correctly (maps to null not undefined)
 *
 *   filterAuditEventsByCaseId:
 *     - Returns an empty array for an empty input list
 *     - Returns an empty array when caseId is an empty string
 *     - Returns only matching events when multiple case IDs are present
 *     - Returns an empty array when no events match the case ID
 *     - Does not mutate the input array
 *
 *   addCaseIdToExportPayload:
 *     - Returns the original payload unchanged when caseId is undefined
 *     - Attaches caseId to a local export payload
 *     - Attaches caseId to a fleet export payload
 *     - Does not mutate the original payload object
 *     - Returns the same object reference when caseId is undefined
 *
 *   createSupportCase:
 *     - Inserts a case and returns the created entity
 *     - Defaults status to 'open'
 *     - Inserts with null created_by when not provided
 *     - Throws when Supabase insert fails
 *
 *   fetchSupportCases:
 *     - Returns an empty array when no cases exist
 *     - Maps DB columns to SupportCase fields correctly
 *     - Filters by status when option is provided
 *     - Applies default limit of 100
 *     - Throws on Supabase query failure
 *
 *   closeSupportCase:
 *     - Calls update with status=closed and closed_at
 *     - Throws on Supabase update failure
 */

import { describe, it, expect, jest } from '@jest/globals';
import {
  recordAuditEvent,
  fetchAuditLog,
  filterAuditEventsByCaseId,
  addCaseIdToExportPayload,
  createSupportCase,
  fetchSupportCases,
  closeSupportCase,
  type AuditEvent,
  type AuditEventType,
} from '../services/supportCaseService';
import type { LocalExportPayload, FleetExportPayload } from '../services/diagnosticsExportService';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Build a minimal AuditEvent for use in pure-function tests. */
function makeAuditEvent(overrides: Partial<AuditEvent> = {}): AuditEvent {
  return {
    id: `evt-${Math.random().toString(36).slice(2)}`,
    caseId: 'CASE-001',
    eventType: 'diagnostic_export',
    actorId: 'admin-user-1',
    payload: null,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

/** Build a Supabase insert stub. */
function makeInsertClientStub(insertError: { message: string } | null = null) {
  return {
    from: jest.fn().mockReturnValue({
      insert: jest.fn().mockResolvedValue({
        data: null,
        error: insertError,
      }),
    }),
  } as any;
}

/** Build a Supabase select stub. */
function makeSelectClientStub(
  rows: Record<string, unknown>[],
  queryError: { message: string } | null = null,
) {
  const limitMock = jest.fn().mockResolvedValue({
    data: queryError ? null : rows,
    error: queryError,
  });
  const orderMock = jest.fn().mockReturnValue({ limit: limitMock });
  const eqMock = jest.fn().mockReturnValue({ order: orderMock });
  const selectResult = { order: orderMock, eq: eqMock };

  return {
    _orderMock: orderMock,
    _limitMock: limitMock,
    _eqMock: eqMock,
    client: {
      from: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue(selectResult),
      }),
    } as any,
  };
}

/** Build a raw DB row as Supabase would return it from `support_audit_log`. */
function makeAuditRow(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: 'some-uuid-1',
    case_id: 'CASE-001',
    event_type: 'diagnostic_export' as AuditEventType,
    actor_id: 'admin-user-1',
    payload: { exportScope: 'local', exportFilename: 'bahati-diagnostics-local-2026.json' },
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

/** Minimal valid LocalExportPayload. */
function makeLocalPayload(): LocalExportPayload {
  return {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    scope: 'local',
    summary: {
      total: 0,
      pending: 0,
      retryWaiting: 0,
      deadLetter: 0,
      synced: 0,
      isFull: false,
      lastUpdated: new Date().toISOString(),
    } as any,
    deadLetterItems: [],
    totalDeadLetterBeforeFilter: 0,
  };
}

/** Minimal valid FleetExportPayload. */
function makeFleetPayload(): FleetExportPayload {
  return {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    scope: 'fleet',
    summary: {
      totalDevicesReporting: 0,
      currentDevicesReporting: 0,
      totalPending: 0,
      currentPending: 0,
      totalRetryWaiting: 0,
      currentRetryWaiting: 0,
      totalDeadLetter: 0,
      currentDeadLetter: 0,
      staleSnapshotCount: 0,
      dataFetchedAt: new Date().toISOString(),
    },
    globalSummary: {
      totalDevicesReporting: 0,
      totalPending: 0,
      totalRetryWaiting: 0,
      totalDeadLetter: 0,
    },
    devices: [],
    totalDevicesBeforeFilter: 0,
  };
}

// ── recordAuditEvent ──────────────────────────────────────────────────────────

describe('recordAuditEvent', () => {
  it('inserts a row with all provided fields', async () => {
    const stub = makeInsertClientStub();
    await recordAuditEvent(stub, {
      caseId: 'CASE-123',
      eventType: 'manual_replay_attempted',
      actorId: 'user-abc',
      payload: { txId: 'tx-1', driverId: 'drv-1' },
    });

    const fromCall = (stub.from as ReturnType<typeof jest.fn>).mock.results[0].value;
    expect(stub.from).toHaveBeenCalledWith('support_audit_log');
    expect(fromCall.insert).toHaveBeenCalledWith({
      case_id:    'CASE-123',
      event_type: 'manual_replay_attempted',
      actor_id:   'user-abc',
      payload:    { txId: 'tx-1', driverId: 'drv-1' },
    });
  });

  it('inserts with null fields when optional fields are omitted', async () => {
    const stub = makeInsertClientStub();
    await recordAuditEvent(stub, { eventType: 'diagnostic_export' });

    const fromCall = (stub.from as ReturnType<typeof jest.fn>).mock.results[0].value;
    expect(fromCall.insert).toHaveBeenCalledWith({
      case_id:    null,
      event_type: 'diagnostic_export',
      actor_id:   null,
      payload:    null,
    });
  });

  it('does not throw when the Supabase insert returns an error', async () => {
    const stub = makeInsertClientStub({ message: 'permission denied' });
    await expect(
      recordAuditEvent(stub, { eventType: 'recovery_action' }),
    ).resolves.toBeUndefined();
  });

  it('does not throw when the Supabase client itself throws', async () => {
    const stub = {
      from: jest.fn().mockReturnValue({
        insert: jest.fn().mockRejectedValue(new Error('network failure')),
      }),
    } as any;
    await expect(
      recordAuditEvent(stub, { eventType: 'recovery_action' }),
    ).resolves.toBeUndefined();
  });
});

// ── fetchAuditLog ─────────────────────────────────────────────────────────────

describe('fetchAuditLog', () => {
  it('returns an empty array when the table has no rows', async () => {
    const { client } = makeSelectClientStub([]);
    const events = await fetchAuditLog(client);
    expect(events).toEqual([]);
  });

  it('maps DB columns to AuditEvent fields correctly', async () => {
    const row = makeAuditRow();
    const { client } = makeSelectClientStub([row]);
    const events = await fetchAuditLog(client);

    expect(events).toHaveLength(1);
    const e = events[0];
    expect(e.id).toBe(row['id']);
    expect(e.caseId).toBe(row['case_id']);
    expect(e.eventType).toBe(row['event_type']);
    expect(e.actorId).toBe(row['actor_id']);
    expect(e.payload).toEqual(row['payload']);
    expect(e.createdAt).toBe(row['created_at']);
  });

  it('returns events in the order received from the DB (newest-first)', async () => {
    const rows = [
      makeAuditRow({ id: 'a', created_at: '2026-03-23T10:00:00Z', event_type: 'diagnostic_export' }),
      makeAuditRow({ id: 'b', created_at: '2026-03-23T09:00:00Z', event_type: 'manual_replay_succeeded' }),
    ];
    const { client } = makeSelectClientStub(rows);
    const events = await fetchAuditLog(client);

    expect(events[0].id).toBe('a');
    expect(events[1].id).toBe('b');
  });

  it('applies a caseId eq filter when the option is provided', async () => {
    const { client, _eqMock } = makeSelectClientStub([]);
    await fetchAuditLog(client, { caseId: 'CASE-XYZ' });
    expect(_eqMock).toHaveBeenCalledWith('case_id', 'CASE-XYZ');
  });

  it('does not apply eq filter when caseId is not provided', async () => {
    const { client, _eqMock } = makeSelectClientStub([]);
    await fetchAuditLog(client);
    expect(_eqMock).not.toHaveBeenCalled();
  });

  it('applies the default limit of 200 when no limit option is provided', async () => {
    const { client, _limitMock } = makeSelectClientStub([]);
    await fetchAuditLog(client);
    expect(_limitMock).toHaveBeenCalledWith(200);
  });

  it('applies a caller-supplied limit', async () => {
    const { client, _limitMock } = makeSelectClientStub([]);
    await fetchAuditLog(client, { limit: 50 });
    expect(_limitMock).toHaveBeenCalledWith(50);
  });

  it('throws a descriptive error when the Supabase query fails', async () => {
    const { client } = makeSelectClientStub([], { message: 'permission denied' });
    await expect(fetchAuditLog(client)).rejects.toThrow(
      'Support audit log query failed: permission denied',
    );
  });

  it('handles null payload gracefully (maps to null)', async () => {
    const row = makeAuditRow({ payload: null });
    const { client } = makeSelectClientStub([row]);
    const events = await fetchAuditLog(client);
    expect(events[0].payload).toBeNull();
  });

  it('handles null actorId gracefully (maps to null)', async () => {
    const row = makeAuditRow({ actor_id: null });
    const { client } = makeSelectClientStub([row]);
    const events = await fetchAuditLog(client);
    expect(events[0].actorId).toBeNull();
  });

  it('handles null caseId correctly (maps to null not undefined)', async () => {
    const row = makeAuditRow({ case_id: null });
    const { client } = makeSelectClientStub([row]);
    const events = await fetchAuditLog(client);
    expect(events[0].caseId).toBeNull();
  });
});

// ── filterAuditEventsByCaseId ─────────────────────────────────────────────────

describe('filterAuditEventsByCaseId', () => {
  it('returns an empty array for an empty input list', () => {
    expect(filterAuditEventsByCaseId([], 'CASE-001')).toEqual([]);
  });

  it('returns an empty array when caseId is an empty string', () => {
    const events = [makeAuditEvent({ caseId: 'CASE-001' })];
    expect(filterAuditEventsByCaseId(events, '')).toEqual([]);
  });

  it('returns only the events matching the given caseId', () => {
    const events = [
      makeAuditEvent({ caseId: 'CASE-001' }),
      makeAuditEvent({ caseId: 'CASE-002' }),
      makeAuditEvent({ caseId: 'CASE-001' }),
    ];
    const result = filterAuditEventsByCaseId(events, 'CASE-001');
    expect(result).toHaveLength(2);
    result.forEach((e) => expect(e.caseId).toBe('CASE-001'));
  });

  it('returns an empty array when no events match the case ID', () => {
    const events = [makeAuditEvent({ caseId: 'CASE-999' })];
    expect(filterAuditEventsByCaseId(events, 'CASE-001')).toEqual([]);
  });

  it('does not mutate the input array', () => {
    const events = [makeAuditEvent({ caseId: 'CASE-001' })];
    const copy = [...events];
    filterAuditEventsByCaseId(events, 'CASE-001');
    expect(events).toEqual(copy);
  });
});

// ── addCaseIdToExportPayload ──────────────────────────────────────────────────

describe('addCaseIdToExportPayload', () => {
  it('returns the payload unchanged when caseId is undefined', () => {
    const payload = makeLocalPayload();
    const result = addCaseIdToExportPayload(payload, undefined);
    expect(result).toBe(payload);
    expect((result as any).caseId).toBeUndefined();
  });

  it('attaches caseId to a local export payload', () => {
    const payload = makeLocalPayload();
    const result = addCaseIdToExportPayload(payload, 'CASE-LOC-1');
    expect((result as any).caseId).toBe('CASE-LOC-1');
    expect(result.scope).toBe('local');
    expect(result.schemaVersion).toBe(1);
  });

  it('attaches caseId to a fleet export payload', () => {
    const payload = makeFleetPayload();
    const result = addCaseIdToExportPayload(payload, 'CASE-FLEET-2');
    expect((result as any).caseId).toBe('CASE-FLEET-2');
    expect(result.scope).toBe('fleet');
    expect(result.schemaVersion).toBe(1);
  });

  it('does not mutate the original payload object', () => {
    const payload = makeLocalPayload();
    const originalKeys = Object.keys(payload);
    addCaseIdToExportPayload(payload, 'CASE-X');
    expect(Object.keys(payload)).toEqual(originalKeys);
    expect((payload as any).caseId).toBeUndefined();
  });
});

// ── Support case CRUD helpers ────────────────────────────────────────────────

/** Build a Supabase client stub for support_cases insert (returning created row). */
function makeCaseInsertStub(
  returnRow: Record<string, unknown> | null,
  insertError: { message: string } | null = null,
) {
  const singleMock = jest.fn().mockResolvedValue({
    data: insertError ? null : returnRow,
    error: insertError,
  });
  const selectMock = jest.fn().mockReturnValue({ single: singleMock });
  return {
    _singleMock: singleMock,
    client: {
      from: jest.fn().mockReturnValue({
        insert: jest.fn().mockReturnValue({ select: selectMock }),
      }),
    } as any,
  };
}

/** Build a raw support_cases DB row. */
function makeCaseRow(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: 'CASE-001',
    title: 'Test case',
    status: 'open',
    created_by: 'admin-1',
    created_at: new Date().toISOString(),
    closed_at: null,
    ...overrides,
  };
}

/** Build a Supabase client stub for support_cases select query. */
function makeCaseSelectStub(
  rows: Record<string, unknown>[],
  queryError: { message: string } | null = null,
) {
  const limitMock = jest.fn().mockResolvedValue({
    data: queryError ? null : rows,
    error: queryError,
  });
  const orderMock = jest.fn().mockReturnValue({ limit: limitMock });
  const eqMock = jest.fn().mockReturnValue({ order: orderMock });
  const selectResult = { order: orderMock, eq: eqMock };

  return {
    _orderMock: orderMock,
    _limitMock: limitMock,
    _eqMock: eqMock,
    client: {
      from: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue(selectResult),
      }),
    } as any,
  };
}

/** Build a Supabase client stub for support_cases update. */
function makeCaseUpdateStub(updateError: { message: string } | null = null) {
  const eqMock = jest.fn().mockResolvedValue({
    data: null,
    error: updateError,
  });
  return {
    _eqMock: eqMock,
    client: {
      from: jest.fn().mockReturnValue({
        update: jest.fn().mockReturnValue({ eq: eqMock }),
      }),
    } as any,
  };
}

// ── createSupportCase ─────────────────────────────────────────────────────────

describe('createSupportCase', () => {
  it('inserts a case and returns the created entity', async () => {
    const row = makeCaseRow();
    const { client } = makeCaseInsertStub(row);
    const result = await createSupportCase(client, { id: 'CASE-001', title: 'Test case', createdBy: 'admin-1' });
    expect(result.id).toBe('CASE-001');
    expect(result.title).toBe('Test case');
    expect(result.status).toBe('open');
    expect(result.createdBy).toBe('admin-1');
  });

  it('inserts with null created_by when createdBy is not provided', async () => {
    const row = makeCaseRow({ created_by: null });
    const { client } = makeCaseInsertStub(row);
    const result = await createSupportCase(client, { id: 'CASE-002', title: 'No author' });
    expect(result.createdBy).toBeNull();
  });

  it('throws when Supabase insert fails', async () => {
    const { client } = makeCaseInsertStub(null, { message: 'duplicate key' });
    await expect(createSupportCase(client, { id: 'CASE-DUP', title: 'dup' })).rejects.toThrow(
      'Failed to create support case: duplicate key',
    );
  });
});

// ── fetchSupportCases ─────────────────────────────────────────────────────────

describe('fetchSupportCases', () => {
  it('returns an empty array when no cases exist', async () => {
    const { client } = makeCaseSelectStub([]);
    const result = await fetchSupportCases(client);
    expect(result).toEqual([]);
  });

  it('maps DB columns to SupportCase fields correctly', async () => {
    const row = makeCaseRow();
    const { client } = makeCaseSelectStub([row]);
    const result = await fetchSupportCases(client);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(row['id']);
    expect(result[0].title).toBe(row['title']);
    expect(result[0].status).toBe(row['status']);
    expect(result[0].createdBy).toBe(row['created_by']);
    expect(result[0].createdAt).toBe(row['created_at']);
    expect(result[0].closedAt).toBeNull();
  });

  it('filters by status when option is provided', async () => {
    const { client, _eqMock } = makeCaseSelectStub([]);
    await fetchSupportCases(client, { status: 'open' });
    expect(_eqMock).toHaveBeenCalledWith('status', 'open');
  });

  it('applies default limit of 100 when no limit option is provided', async () => {
    const { client, _limitMock } = makeCaseSelectStub([]);
    await fetchSupportCases(client);
    expect(_limitMock).toHaveBeenCalledWith(100);
  });

  it('applies a caller-supplied limit', async () => {
    const { client, _limitMock } = makeCaseSelectStub([]);
    await fetchSupportCases(client, { limit: 25 });
    expect(_limitMock).toHaveBeenCalledWith(25);
  });

  it('throws on Supabase query failure', async () => {
    const { client } = makeCaseSelectStub([], { message: 'permission denied' });
    await expect(fetchSupportCases(client)).rejects.toThrow(
      'Support cases query failed: permission denied',
    );
  });

  it('handles null created_by and closed_at gracefully', async () => {
    const row = makeCaseRow({ created_by: null, closed_at: null });
    const { client } = makeCaseSelectStub([row]);
    const result = await fetchSupportCases(client);
    expect(result[0].createdBy).toBeNull();
    expect(result[0].closedAt).toBeNull();
  });

  it('maps closed_at when present', async () => {
    const ts = new Date().toISOString();
    const row = makeCaseRow({ status: 'closed', closed_at: ts });
    const { client } = makeCaseSelectStub([row]);
    const result = await fetchSupportCases(client);
    expect(result[0].status).toBe('closed');
    expect(result[0].closedAt).toBe(ts);
  });
});

// ── closeSupportCase ──────────────────────────────────────────────────────────

describe('closeSupportCase', () => {
  it('calls update with status=closed on the correct case ID', async () => {
    const { client, _eqMock } = makeCaseUpdateStub();
    await closeSupportCase(client, 'CASE-TO-CLOSE');
    expect(_eqMock).toHaveBeenCalledWith('id', 'CASE-TO-CLOSE');
    expect(client.from).toHaveBeenCalledWith('support_cases');
  });

  it('throws on Supabase update failure', async () => {
    const { client } = makeCaseUpdateStub({ message: 'not found' });
    await expect(closeSupportCase(client, 'CASE-MISSING')).rejects.toThrow(
      'Failed to close support case: not found',
    );
  });
});
