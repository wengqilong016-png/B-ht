/**
 * Finance audit log service — append-only trail for debt & commission changes.
 *
 * Writes are fire-and-forget (console.warn on failure) so they never block
 * the mutation that triggered them.
 */

import { supabase } from '../supabaseClient';
import type { FinanceAuditLog, FinanceAuditEventType } from '../types';

// ── Write ────────────────────────────────────────────────────────────────────

export interface AuditEntry {
  event_type: FinanceAuditEventType;
  entity_type: 'location' | 'driver';
  entity_id: string;
  entity_name?: string;
  actor_id: string;
  old_value: number | null;
  new_value: number | null;
  payload?: Record<string, unknown>;
}

/** Insert one audit row. Fire-and-forget — never throws. */
export async function logFinanceAudit(entry: AuditEntry): Promise<void> {
  if (!supabase) return;
  try {
    const { error } = await supabase
      .from('finance_audit_log')
      .insert({
        event_type: entry.event_type,
        entity_type: entry.entity_type,
        entity_id: entry.entity_id,
        entity_name: entry.entity_name ?? null,
        actor_id: entry.actor_id,
        old_value: entry.old_value,
        new_value: entry.new_value,
        payload: entry.payload ?? {},
      });
    if (error) console.warn('[financeAudit] insert failed:', error.message);
  } catch (err) {
    console.warn('[financeAudit] insert failed:', err);
  }
}

/** Insert multiple audit rows in a single request. Fire-and-forget. */
export async function logFinanceAuditBatch(entries: AuditEntry[]): Promise<void> {
  if (entries.length === 0) return;
  if (!supabase) return;
  try {
    const { error } = await supabase
      .from('finance_audit_log')
      .insert(entries.map(e => ({
        event_type: e.event_type,
        entity_type: e.entity_type,
        entity_id: e.entity_id,
        entity_name: e.entity_name ?? null,
        actor_id: e.actor_id,
        old_value: e.old_value,
        new_value: e.new_value,
        payload: e.payload ?? {},
      })));
    if (error) console.warn('[financeAudit] batch insert failed:', error.message);
  } catch (err) {
    console.warn('[financeAudit] batch insert failed:', err);
  }
}

// ── Read ─────────────────────────────────────────────────────────────────────

interface FetchAuditOpts {
  entityType?: 'location' | 'driver';
  entityId?: string;
  limit?: number;
}

/** Fetch recent audit log entries (admin only via RLS). */
export async function fetchFinanceAuditLog(
  opts: FetchAuditOpts = {},
): Promise<FinanceAuditLog[]> {
  if (!supabase) return [];
  let query = supabase
    .from('finance_audit_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(opts.limit ?? 50);

  if (opts.entityType) query = query.eq('entity_type', opts.entityType);
  if (opts.entityId) query = query.eq('entity_id', opts.entityId);

  const { data, error } = await query;
  if (error) {
    console.warn('[financeAudit] fetch failed:', error.message);
    return [];
  }
  return (data ?? []) as FinanceAuditLog[];
}
