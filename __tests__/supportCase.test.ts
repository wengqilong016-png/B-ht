/**
 * __tests__/supportCase.test.ts
 *
 * Stage-9: focused tests for support case linking and audit trail visibility.
 *
 * Coverage:
 *   recordAuditEvent:
 *     - Returns a mapped AuditEvent on success
 *     - Returns null and logs a warning when Supabase insert fails
 *     - Returns null and logs a warning on unexpected error
 *     - Omits case_id from the insert row when caseId is undefined
 *     - Includes case_id in the insert row when caseId is provided
 *     - Includes metadata in the insert row when provided
 *
 *   fetchAuditLog:
 *     - Returns an empty array when the table has no rows
 *     - Maps DB columns to AuditEvent fields correctly
 *     - Omits caseId from the AuditEvent when case_id is null
 *     - Sets caseId when case_id is non-null
 *     - Omits metadata when the DB value is null
 *     - Sets metadata when the DB value is an object
 *     - Throws a descriptive error when the Supabase query fails
 *     - Passes limit parameter to the query
 *
 *   filterAuditEventsByCaseId:
 *     - Returns all events matching the given caseId
 *     - Returns an empty array when no events match
 *     - Returns an empty array for an empty input
 *
 *   addCaseIdToExportPayload:
 *     - Returns a new object that includes caseId
 *     - Does not mutate the original payload
 *     - Overwrites an existing caseId field
 */

import { describe, it, expect, jest } from '@jest/globals';
import {
  recordAuditEvent,
  fetchAuditLog,
  filterAuditEventsByCaseId,
  addCaseIdToExportPayload,
  type AuditEvent,
  type RecordAuditEventParams,
} from '../services/supportCaseService';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Minimal params for a valid audit event record call. */
function makeParams(overrides: Partial<RecordAuditEventParams> = {}): RecordAuditEventParams {
  return {
    action: 'export_triggered',
    actorId: 'admin-001',
    actorName: 'Admin User',
    resourceType: 'export',
    resourceId: 'bahati-diagnostics-fleet-2026-03-22.json',
    ...overrides,
  };
}

/** Build a raw DB row as Supabase would return from `support_audit_log`. */
function makeDbRow(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: 'row-uuid-123',
    action: 'export_triggered',
    actor_id: 'admin-001',
    actor_name: 'Admin User',
    case_id: null,
    resource_type: 'export',
    resource_id: 'bahati-diagnostics-fleet-2026-03-22.json',
    metadata: null,
    recorded_at: '2026-03-22T19:00:00.000Z',
    ...overrides,
  };
}

/** Build a minimal AuditEvent object for filter tests. */
function makeEvent(overrides: Partial<AuditEvent> = {}): AuditEvent {
  return {
    id: 'evt-1',
    action: 'export_triggered',
    actorId: 'admin-001',
    actorName: 'Admin User',
    resourceType: 'export',
    resourceId: 'file.json',
    recordedAt: '2026-03-22T19:00:00.000Z',
    ...overrides,
  };
}

// ── Supabase client stubs ─────────────────────────────────────────────────────

/** Stub that simulates a successful insert returning one row. */
function makeInsertClientStub(returnRow: Record<string, unknown>) {
  return {
    from: jest.fn().mockReturnValue({
      insert: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({ data: returnRow, error: null }),
        }),
      }),
    }),
  } as any;
}

/** Stub that simulates an insert error from Supabase. */
function makeInsertErrorStub(errorMessage: string) {
  return {
    from: jest.fn().mockReturnValue({
      insert: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({ data: null, error: { message: errorMessage } }),
        }),
      }),
    }),
  } as any;
}

/** Stub that simulates a thrown exception during insert. */
function makeInsertThrowStub(err: unknown) {
  return {
    from: jest.fn().mockReturnValue({
      insert: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          single: jest.fn().mockRejectedValue(err),
        }),
      }),
    }),
  } as any;
}

/** Stub that simulates a successful select from `support_audit_log`. */
function makeSelectClientStub(
  rows: Record<string, unknown>[],
  queryError: { message: string } | null = null,
) {
  return {
    from: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        order: jest.fn().mockReturnValue({
          limit: jest.fn().mockResolvedValue({
            data: queryError ? null : rows,
            error: queryError,
          }),
        }),
      }),
    }),
  } as any;
}

// ── recordAuditEvent ──────────────────────────────────────────────────────────

describe('recordAuditEvent', () => {
  it('returns a mapped AuditEvent on success', async () => {
    const row = makeDbRow({ case_id: 'CASE-42' });
    const client = makeInsertClientStub(row);
    const result = await recordAuditEvent(client, makeParams({ caseId: 'CASE-42' }));

    expect(result).not.toBeNull();
    expect(result!.id).toBe('row-uuid-123');
    expect(result!.action).toBe('export_triggered');
    expect(result!.actorId).toBe('admin-001');
    expect(result!.actorName).toBe('Admin User');
    expect(result!.caseId).toBe('CASE-42');
    expect(result!.resourceType).toBe('export');
    expect(result!.resourceId).toBe('bahati-diagnostics-fleet-2026-03-22.json');
    expect(result!.recordedAt).toBe('2026-03-22T19:00:00.000Z');
  });

  it('returns null when Supabase insert reports an error', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const client = makeInsertErrorStub('permission denied');
    const result = await recordAuditEvent(client, makeParams());

    expect(result).toBeNull();
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('[supportCaseService]'),
      expect.stringContaining('permission denied'),
    );
    consoleSpy.mockRestore();
  });

  it('returns null on unexpected exception', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const client = makeInsertThrowStub(new Error('network failure'));
    const result = await recordAuditEvent(client, makeParams());

    expect(result).toBeNull();
    consoleSpy.mockRestore();
  });

  it('omits case_id from the insert row when caseId is undefined', async () => {
    const row = makeDbRow();
    const client = makeInsertClientStub(row);
    await recordAuditEvent(client, makeParams()); // no caseId

    const fromResult = (client.from as ReturnType<typeof jest.fn>).mock.results[0].value;
    const insertedRow: Record<string, unknown> =
      (fromResult.insert as ReturnType<typeof jest.fn>).mock.calls[0][0];
    expect(Object.prototype.hasOwnProperty.call(insertedRow, 'case_id')).toBe(false);
  });

  it('includes case_id in the insert row when caseId is provided', async () => {
    const row = makeDbRow({ case_id: 'CASE-007' });
    const client = makeInsertClientStub(row);
    await recordAuditEvent(client, makeParams({ caseId: 'CASE-007' }));

    const fromResult = (client.from as ReturnType<typeof jest.fn>).mock.results[0].value;
    const insertedRow: Record<string, unknown> =
      (fromResult.insert as ReturnType<typeof jest.fn>).mock.calls[0][0];
    expect(insertedRow['case_id']).toBe('CASE-007');
  });

  it('includes metadata in the insert row when provided', async () => {
    const row = makeDbRow({ metadata: { scope: 'fleet', filter: 'dead-letter' } });
    const client = makeInsertClientStub(row);
    const meta = { scope: 'fleet', filter: 'dead-letter' };
    await recordAuditEvent(client, makeParams({ metadata: meta }));

    const fromResult = (client.from as ReturnType<typeof jest.fn>).mock.results[0].value;
    const insertedRow: Record<string, unknown> =
      (fromResult.insert as ReturnType<typeof jest.fn>).mock.calls[0][0];
    expect(insertedRow['metadata']).toEqual(meta);
  });
});

// ── fetchAuditLog ─────────────────────────────────────────────────────────────

describe('fetchAuditLog', () => {
  it('returns an empty array when the table has no rows', async () => {
    const client = makeSelectClientStub([]);
    const events = await fetchAuditLog(client);
    expect(events).toEqual([]);
  });

  it('maps DB columns to AuditEvent fields correctly', async () => {
    const row = makeDbRow({
      case_id: null,
      metadata: null,
      recorded_at: '2026-03-22T18:00:00.000Z',
    });
    const client = makeSelectClientStub([row]);
    const events = await fetchAuditLog(client);

    expect(events).toHaveLength(1);
    const evt = events[0];
    expect(evt.id).toBe('row-uuid-123');
    expect(evt.action).toBe('export_triggered');
    expect(evt.actorId).toBe('admin-001');
    expect(evt.actorName).toBe('Admin User');
    expect(evt.resourceType).toBe('export');
    expect(evt.resourceId).toBe('bahati-diagnostics-fleet-2026-03-22.json');
    expect(evt.recordedAt).toBe('2026-03-22T18:00:00.000Z');
  });

  it('omits caseId from the AuditEvent when case_id is null', async () => {
    const client = makeSelectClientStub([makeDbRow({ case_id: null })]);
    const events = await fetchAuditLog(client);
    expect(Object.prototype.hasOwnProperty.call(events[0], 'caseId')).toBe(false);
  });

  it('sets caseId when case_id is non-null', async () => {
    const client = makeSelectClientStub([makeDbRow({ case_id: 'CASE-99' })]);
    const events = await fetchAuditLog(client);
    expect(events[0].caseId).toBe('CASE-99');
  });

  it('omits metadata field when the DB value is null', async () => {
    const client = makeSelectClientStub([makeDbRow({ metadata: null })]);
    const events = await fetchAuditLog(client);
    expect(Object.prototype.hasOwnProperty.call(events[0], 'metadata')).toBe(false);
  });

  it('sets metadata when the DB value is an object', async () => {
    const meta = { scope: 'local', driverId: 'drv-1' };
    const client = makeSelectClientStub([makeDbRow({ metadata: meta })]);
    const events = await fetchAuditLog(client);
    expect(events[0].metadata).toEqual(meta);
  });

  it('throws a descriptive error when the Supabase query fails', async () => {
    const client = makeSelectClientStub([], { message: 'JWT expired' });
    await expect(fetchAuditLog(client)).rejects.toThrow('Audit log query failed: JWT expired');
  });

  it('passes the limit parameter through to the Supabase query', async () => {
    const client = makeSelectClientStub([]);
    await fetchAuditLog(client, 25);

    const fromResult = (client.from as ReturnType<typeof jest.fn>).mock.results[0].value;
    const selectResult = fromResult.select.mock.results[0].value;
    const orderResult = selectResult.order.mock.results[0].value;
    expect(orderResult.limit).toHaveBeenCalledWith(25);
  });
});

// ── filterAuditEventsByCaseId ─────────────────────────────────────────────────

describe('filterAuditEventsByCaseId', () => {
  it('returns all events matching the given caseId', () => {
    const events = [
      makeEvent({ id: 'evt-1', caseId: 'CASE-1' }),
      makeEvent({ id: 'evt-2', caseId: 'CASE-2' }),
      makeEvent({ id: 'evt-3', caseId: 'CASE-1' }),
    ];
    const filtered = filterAuditEventsByCaseId(events, 'CASE-1');
    expect(filtered).toHaveLength(2);
    expect(filtered.map((e) => e.id)).toEqual(['evt-1', 'evt-3']);
  });

  it('returns an empty array when no events match', () => {
    const events = [makeEvent({ caseId: 'CASE-A' }), makeEvent({ caseId: 'CASE-B' })];
    expect(filterAuditEventsByCaseId(events, 'CASE-Z')).toEqual([]);
  });

  it('returns an empty array for an empty input', () => {
    expect(filterAuditEventsByCaseId([], 'CASE-1')).toEqual([]);
  });

  it('does not return events without a caseId', () => {
    const events = [makeEvent({ id: 'evt-no-case' }), makeEvent({ id: 'evt-with-case', caseId: 'CASE-X' })];
    const filtered = filterAuditEventsByCaseId(events, 'CASE-X');
    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe('evt-with-case');
  });
});

// ── addCaseIdToExportPayload ──────────────────────────────────────────────────

describe('addCaseIdToExportPayload', () => {
  it('returns a new object that includes caseId', () => {
    const payload = { schemaVersion: 1, scope: 'fleet', exportedAt: '2026-03-22T00:00:00.000Z' } as const;
    const result = addCaseIdToExportPayload(payload, 'CASE-55');
    expect(result.caseId).toBe('CASE-55');
  });

  it('preserves all original payload fields', () => {
    const payload = { schemaVersion: 1 as const, scope: 'local' as const, exportedAt: '2026-03-22T00:00:00.000Z', totalDeadLetterBeforeFilter: 3 };
    const result = addCaseIdToExportPayload(payload, 'CASE-1');
    expect(result.schemaVersion).toBe(1);
    expect(result.scope).toBe('local');
    expect(result.totalDeadLetterBeforeFilter).toBe(3);
  });

  it('does not mutate the original payload object', () => {
    const payload = { schemaVersion: 1 as const, scope: 'fleet' as const, exportedAt: '2026-03-22T00:00:00.000Z' };
    addCaseIdToExportPayload(payload, 'CASE-99');
    expect(Object.prototype.hasOwnProperty.call(payload, 'caseId')).toBe(false);
  });

  it('overwrites an existing caseId field', () => {
    const payload = { schemaVersion: 1 as const, scope: 'fleet' as const, exportedAt: '2026-03-22T00:00:00.000Z', caseId: 'OLD-CASE' };
    const result = addCaseIdToExportPayload(payload, 'NEW-CASE');
    expect(result.caseId).toBe('NEW-CASE');
  });
});
