/**
 * supportCaseService.ts
 *
 * Stage-9: lightweight support case linking and operator audit trail.
 *
 * This module provides:
 *
 *   1. Support case CRUD — `createSupportCase()`, `fetchSupportCases()`,
 *      `closeSupportCase()` manage lightweight case entities in the
 *      `support_cases` Supabase table.
 *
 *   2. Audit event recording — `recordAuditEvent()` writes a single row to the
 *      `support_audit_log` Supabase table.  The call is fire-and-forget: it
 *      never throws so callers do not need try/catch.
 *
 *   3. Audit log retrieval — `fetchAuditLog()` reads the most recent entries
 *      from `support_audit_log`.  Errors are surfaced as thrown exceptions so
 *      the UI can display a useful message.
 *
 *   4. Case filtering — `filterAuditEventsByCaseId()` is a pure helper for
 *      narrowing an already-fetched log to a single support case.
 *
 *   5. Export enrichment — `addCaseIdToExportPayload()` attaches an optional
 *      `caseId` field to an export payload before it is downloaded, so that
 *      the JSON file itself carries the traceability reference.
 *
 * Audit event types
 * ─────────────────
 *   diagnostic_export        – operator triggered a diagnostics export
 *   health_alert_linked      – operator linked a health alert to a support case
 *   manual_replay_attempted  – operator initiated a dead-letter manual replay
 *   manual_replay_succeeded  – manual replay completed successfully
 *   manual_replay_failed     – manual replay failed (error recorded in payload)
 *   recovery_action          – generic operator recovery action
 *
 * Payload design
 * ──────────────
 * Payloads are structured objects safe for operator review.
 * They must never contain PII, GPS coordinates, or raw finance values.
 * Acceptable payload fields: ids (txId, deviceId, driverId), counts, error
 * category strings, scope labels, export filenames, and timestamps.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { LocalExportPayload, FleetExportPayload } from './diagnosticsExportService';

// ── Types ─────────────────────────────────────────────────────────────────────

/** All valid audit event type strings. */
export type AuditEventType =
  | 'diagnostic_export'
  | 'health_alert_linked'
  | 'manual_replay_attempted'
  | 'manual_replay_succeeded'
  | 'manual_replay_failed'
  | 'recovery_action';

/**
 * Structured payload attached to an audit event.
 * All fields are optional; include only what is relevant for the event type.
 * No PII, GPS coordinates, or raw finance values.
 */
export interface AuditEventPayload {
  /** Affected transaction ID (dead-letter replay events). */
  txId?: string;
  /** Device ID involved in the action. */
  deviceId?: string;
  /** Driver ID involved in the action (not a name — non-PII ID). */
  driverId?: string;
  /** Error category recorded for a failed replay (e.g. 'transient' | 'permanent'). */
  errorCategory?: string;
  /** Short error message summary (no full stack traces). */
  errorSummary?: string;
  /** Export scope for diagnostic_export events ('local' | 'fleet'). */
  exportScope?: 'local' | 'fleet';
  /** Filename used for the export download. */
  exportFilename?: string;
  /** Alert type for health_alert_linked events. */
  alertType?: string;
  /** Alert severity for health_alert_linked events. */
  alertSeverity?: string;
  /** Free-form note from the operator (max 500 chars). */
  note?: string;
}

/** One row from the `support_audit_log` table. */
export interface AuditEvent {
  id: string;
  caseId: string | null;
  eventType: AuditEventType;
  actorId: string | null;
  payload: AuditEventPayload | null;
  createdAt: string;
}

/** Input for recording a new audit event. */
export interface RecordAuditEventInput {
  /** Optional support case reference (free-form string set by the operator). */
  caseId?: string;
  /** Type of action being recorded. */
  eventType: AuditEventType;
  /**
   * ID of the actor performing the action (typically the authenticated user ID
   * or the device ID for background/automated events).
   */
  actorId?: string;
  /** Structured details safe for operator review. */
  payload?: AuditEventPayload;
}

/** Options for `fetchAuditLog`. */
export interface FetchAuditLogOptions {
  /** Filter to a specific support case ID. */
  caseId?: string;
  /** Maximum number of rows to return (default: 200). */
  limit?: number;
}

// ── Support case types ──────────────────────────────────────────────────────

/** Status of a support case. */
export type SupportCaseStatus = 'open' | 'closed';

/** One row from the `support_cases` table. */
export interface SupportCase {
  id: string;
  title: string;
  status: SupportCaseStatus;
  createdBy: string | null;
  createdAt: string;
  closedAt: string | null;
}

/** Input for creating a new support case. */
export interface CreateSupportCaseInput {
  /** Operator-assigned case ID (e.g. CASE-2026-001). */
  id: string;
  /** Short human-readable summary. */
  title: string;
  /** Actor who opened the case. */
  createdBy?: string;
}

/** Options for listing support cases. */
export interface FetchSupportCasesOptions {
  /** Filter by status. When omitted, all cases are returned. */
  status?: SupportCaseStatus;
  /** Maximum number of rows to return (default: 100). */
  limit?: number;
}

// ── Export payload enrichment type ───────────────────────────────────────────

/** A local or fleet export payload enriched with a support case reference. */
export type EnrichedExportPayload<T extends LocalExportPayload | FleetExportPayload> = T & {
  /** Support case reference attached at export time, if provided. */
  caseId?: string;
};

// ── Core functions ────────────────────────────────────────────────────────────

/**
 * Write a single audit event row to `support_audit_log`.
 *
 * Fire-and-forget: this function never throws.  Supabase errors are caught
 * and logged to the console so that callers do not need try/catch.
 *
 * @param supabaseClient  Supabase client instance.
 * @param input           Event details.
 */
export async function recordAuditEvent(
  supabaseClient: SupabaseClient,
  input: RecordAuditEventInput,
): Promise<void> {
  try {
    const { error } = await supabaseClient
      .from('support_audit_log')
      .insert({
        case_id:    input.caseId    ?? null,
        event_type: input.eventType,
        actor_id:   input.actorId   ?? null,
        payload:    input.payload   ?? null,
      });
    if (error) {
      console.error('[SupportAuditLog] Failed to record audit event:', error.message);
    }
  } catch (e) {
    console.error('[SupportAuditLog] Unexpected error recording audit event:', e);
  }
}

/**
 * Fetch the most recent audit events from `support_audit_log`.
 *
 * @param supabaseClient  Supabase client instance.
 * @param options         Optional filters and pagination.
 * @returns               Array of {@link AuditEvent}s sorted newest-first.
 * @throws                Error when the Supabase query fails (network error, auth).
 */
export async function fetchAuditLog(
  supabaseClient: SupabaseClient,
  options?: FetchAuditLogOptions,
): Promise<AuditEvent[]> {
  const limit = options?.limit ?? 200;

  let query = supabaseClient
    .from('support_audit_log')
    .select('id, case_id, event_type, actor_id, payload, created_at');

  if (options?.caseId) {
    query = query.eq('case_id', options.caseId);
  }

  const { data, error } = await query
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Support audit log query failed: ${error.message}`);
  }

  const rows: Array<Record<string, unknown>> = data ?? [];

  return rows.map((row): AuditEvent => ({
    id:         String(row['id']         ?? ''),
    caseId:     row['case_id']  != null  ? String(row['case_id'])  : null,
    eventType:  String(row['event_type'] ?? '') as AuditEventType,
    actorId:    row['actor_id'] != null  ? String(row['actor_id']) : null,
    payload:    row['payload']  != null  ? (row['payload'] as AuditEventPayload) : null,
    createdAt:  String(row['created_at'] ?? ''),
  }));
}

/**
 * Filter a pre-fetched audit log to events belonging to a specific support case.
 *
 * Pure function — no side effects.
 *
 * @param events  Array of {@link AuditEvent}s (e.g. from `fetchAuditLog`).
 * @param caseId  The support case ID to filter by.
 * @returns       Subset of events where `caseId` matches.
 */
export function filterAuditEventsByCaseId(
  events: AuditEvent[],
  caseId: string,
): AuditEvent[] {
  if (!caseId) return [];
  return events.filter((e) => e.caseId === caseId);
}

/**
 * Attach a support case ID to an export payload.
 *
 * Returns a new object — never mutates the input.
 *
 * @param payload  A local or fleet export payload.
 * @param caseId   Support case ID to attach.  If falsy (undefined, null, or empty
 *                 string) the payload is returned unchanged without a `caseId` field.
 */
export function addCaseIdToExportPayload<T extends LocalExportPayload | FleetExportPayload>(
  payload: T,
  caseId?: string,
): EnrichedExportPayload<T> {
  if (!caseId) return payload as EnrichedExportPayload<T>;
  return { ...payload, caseId } as EnrichedExportPayload<T>;
}

// ── Support case CRUD ─────────────────────────────────────────────────────────

/**
 * Create a new support case in the `support_cases` table.
 *
 * @param supabaseClient  Supabase client instance.
 * @param input           Case details.
 * @returns               The created {@link SupportCase}.
 * @throws                Error when the Supabase insert fails.
 */
export async function createSupportCase(
  supabaseClient: SupabaseClient,
  input: CreateSupportCaseInput,
): Promise<SupportCase> {
  const { data, error } = await supabaseClient
    .from('support_cases')
    .insert({
      id:         input.id,
      title:      input.title,
      status:     'open',
      created_by: input.createdBy ?? null,
    })
    .select('id, title, status, created_by, created_at, closed_at')
    .single();

  if (error) {
    throw new Error(`Failed to create support case: ${error.message}`);
  }

  const row = data as Record<string, unknown>;
  return {
    id:         String(row['id']         ?? ''),
    title:      String(row['title']      ?? ''),
    status:     String(row['status']     ?? 'open') as SupportCaseStatus,
    createdBy:  row['created_by'] != null ? String(row['created_by']) : null,
    createdAt:  String(row['created_at'] ?? ''),
    closedAt:   row['closed_at'] != null  ? String(row['closed_at']) : null,
  };
}

/**
 * Fetch support cases from the `support_cases` table.
 *
 * @param supabaseClient  Supabase client instance.
 * @param options         Optional filters and pagination.
 * @returns               Array of {@link SupportCase}s sorted newest-first.
 * @throws                Error when the Supabase query fails.
 */
export async function fetchSupportCases(
  supabaseClient: SupabaseClient,
  options?: FetchSupportCasesOptions,
): Promise<SupportCase[]> {
  const limit = options?.limit ?? 100;

  let query = supabaseClient
    .from('support_cases')
    .select('id, title, status, created_by, created_at, closed_at');

  if (options?.status) {
    query = query.eq('status', options.status);
  }

  const { data, error } = await query
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Support cases query failed: ${error.message}`);
  }

  const rows: Array<Record<string, unknown>> = data ?? [];

  return rows.map((row): SupportCase => ({
    id:         String(row['id']         ?? ''),
    title:      String(row['title']      ?? ''),
    status:     String(row['status']     ?? 'open') as SupportCaseStatus,
    createdBy:  row['created_by'] != null ? String(row['created_by']) : null,
    createdAt:  String(row['created_at'] ?? ''),
    closedAt:   row['closed_at'] != null  ? String(row['closed_at']) : null,
  }));
}

/**
 * Close an open support case by setting status to 'closed' and recording
 * `closed_at`.
 *
 * @param supabaseClient  Supabase client instance.
 * @param caseId          The ID of the case to close.
 * @throws                Error when the Supabase update fails.
 */
export async function closeSupportCase(
  supabaseClient: SupabaseClient,
  caseId: string,
): Promise<void> {
  const { error } = await supabaseClient
    .from('support_cases')
    .update({
      status:    'closed',
      closed_at: new Date().toISOString(),
    })
    .eq('id', caseId);

  if (error) {
    throw new Error(`Failed to close support case: ${error.message}`);
  }
}
