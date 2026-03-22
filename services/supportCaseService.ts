/**
 * supportCaseService.ts
 *
 * Stage-9: support case linking and audit trail.
 *
 * Provides a lightweight, append-only audit trail that makes admin and
 * support actions traceable over time.  Every significant action — viewing
 * fleet diagnostics with an open case reference, triggering an export,
 * linking an alert to a support case, or manually replaying a dead-letter
 * item — can be recorded here so investigators can reconstruct what happened
 * without digging through application logs.
 *
 * Design goals:
 *   • Append-only: `recordAuditEvent` never updates existing rows.
 *   • Fire-and-forget safe: errors are caught and logged; they never throw
 *     so a failed audit write never interrupts an admin action.
 *   • Read-only reader: `fetchAuditLog` returns events newest-first; no
 *     deletions, no mutations.
 *   • Support case linkage is optional on every event.  Linkage is just a
 *     free-text `caseId` string — no foreign key to a separate cases table
 *     is needed at this stage.
 *
 * Audit event actions
 * ───────────────────
 *   alert_linked_to_case     – admin tagged a health alert with a case ID
 *   export_triggered         – admin triggered a diagnostics export
 *   export_linked_to_case    – export was explicitly linked to a case ID
 *   manual_replay_triggered  – admin triggered a dead-letter manual replay
 *   fleet_diagnostics_viewed – admin opened fleet-wide diagnostics view
 *   health_alerts_viewed     – admin opened the health alerts panel
 */

import type { SupabaseClient } from '@supabase/supabase-js';

// ── Types ─────────────────────────────────────────────────────────────────────

export type AuditEventAction =
  | 'alert_linked_to_case'
  | 'export_triggered'
  | 'export_linked_to_case'
  | 'manual_replay_triggered'
  | 'fleet_diagnostics_viewed'
  | 'health_alerts_viewed';

/** Scope of the resource the audit event relates to. */
export type AuditResourceType = 'alert' | 'export' | 'replay' | 'diagnostics';

/** One entry in the support audit log. */
export interface AuditEvent {
  /** Row primary key (UUID). */
  id: string;
  /** The action that was performed. */
  action: AuditEventAction;
  /** ID of the admin/support user who performed the action. */
  actorId: string;
  /** Display name of the actor. */
  actorName: string;
  /** Optional support case reference (free-text). */
  caseId?: string;
  /** Type of the resource involved. */
  resourceType: AuditResourceType;
  /** Identifier of the resource (alertId, exportFilename, txId, etc.). */
  resourceId: string;
  /** Arbitrary extra context (serialised to JSONB in Supabase). */
  metadata?: Record<string, unknown>;
  /** ISO-8601 timestamp when the event was recorded. */
  recordedAt: string;
}

/** Parameters passed to `recordAuditEvent`. */
export interface RecordAuditEventParams {
  action: AuditEventAction;
  actorId: string;
  actorName: string;
  caseId?: string;
  resourceType: AuditResourceType;
  resourceId: string;
  metadata?: Record<string, unknown>;
}

// ── Audit event writer ────────────────────────────────────────────────────────

/**
 * Appends one event to the `support_audit_log` Supabase table.
 *
 * This function is fire-and-forget safe: it catches and logs any Supabase
 * error so the caller's main workflow is never interrupted by an audit
 * write failure.
 *
 * Returns the persisted `AuditEvent` on success, or `null` on failure.
 */
export async function recordAuditEvent(
  supabaseClient: SupabaseClient,
  params: RecordAuditEventParams,
): Promise<AuditEvent | null> {
  const recordedAt = new Date().toISOString();

  const row: Record<string, unknown> = {
    action: params.action,
    actor_id: params.actorId,
    actor_name: params.actorName,
    resource_type: params.resourceType,
    resource_id: params.resourceId,
    recorded_at: recordedAt,
  };
  if (params.caseId !== undefined) row['case_id'] = params.caseId;
  if (params.metadata !== undefined) row['metadata'] = params.metadata;

  try {
    const { data, error } = await supabaseClient
      .from('support_audit_log')
      .insert(row)
      .select('id, action, actor_id, actor_name, case_id, resource_type, resource_id, metadata, recorded_at')
      .single();

    if (error) {
      console.error('[supportCaseService] Failed to record audit event:', error.message);
      return null;
    }

    return rowToAuditEvent(data as Record<string, unknown>);
  } catch (err) {
    console.error('[supportCaseService] Unexpected error recording audit event:', err);
    return null;
  }
}

// ── Audit log reader ──────────────────────────────────────────────────────────

/**
 * Fetches recent entries from `support_audit_log`, newest-first.
 *
 * @param limit  Maximum rows to return (default: 100).
 *
 * @throws Error when the Supabase query fails (network error, auth).
 */
export async function fetchAuditLog(
  supabaseClient: SupabaseClient,
  limit = 100,
): Promise<AuditEvent[]> {
  const { data, error } = await supabaseClient
    .from('support_audit_log')
    .select('id, action, actor_id, actor_name, case_id, resource_type, resource_id, metadata, recorded_at')
    .order('recorded_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Audit log query failed: ${error.message}`);
  }

  const rows: Array<Record<string, unknown>> = data ?? [];
  return rows.map(rowToAuditEvent);
}

// ── Support case linkage helpers ──────────────────────────────────────────────

/**
 * Returns a copy of any export payload with an optional `caseId` field added.
 *
 * This is a pure helper: it makes no writes, it just annotates the payload
 * object so the downloaded JSON file carries a case reference.
 *
 * @param payload  A `LocalExportPayload` or `FleetExportPayload` (or any
 *                 serialisable record).
 * @param caseId   Support case identifier to embed.
 */
export function addCaseIdToExportPayload<T extends Record<string, unknown>>(
  payload: T,
  caseId: string,
): T & { caseId: string } {
  return { ...payload, caseId };
}

/**
 * Returns a list of audit events filtered to those associated with a given
 * case ID.  Works on a pre-fetched list so no extra Supabase query is needed.
 */
export function filterAuditEventsByCaseId(
  events: AuditEvent[],
  caseId: string,
): AuditEvent[] {
  return events.filter((e) => e.caseId === caseId);
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function rowToAuditEvent(row: Record<string, unknown>): AuditEvent {
  const event: AuditEvent = {
    id: String(row['id'] ?? ''),
    action: String(row['action'] ?? '') as AuditEventAction,
    actorId: String(row['actor_id'] ?? ''),
    actorName: String(row['actor_name'] ?? ''),
    resourceType: String(row['resource_type'] ?? '') as AuditResourceType,
    resourceId: String(row['resource_id'] ?? ''),
    recordedAt: String(row['recorded_at'] ?? ''),
  };
  if (row['case_id'] != null) event.caseId = String(row['case_id']);
  if (row['metadata'] != null && typeof row['metadata'] === 'object') {
    event.metadata = row['metadata'] as Record<string, unknown>;
  }
  return event;
}
