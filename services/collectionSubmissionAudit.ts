export interface CollectionSubmissionAuditEntry {
  timestamp: string;
  event:
    | 'submit_attempt'
    | 'submit_server_success'
    | 'submit_server_failure'
    | 'submit_offline_enqueued'
    | 'submit_invalid_score'
    | 'queue_flush_success'
    | 'queue_flush_failure';
  txId?: string;
  locationId?: string;
  locationName?: string;
  driverId?: string;
  currentScoreRaw?: string;
  resolvedScore?: number;
  previousScore?: number;
  source?: 'server' | 'offline';
  reason?: string;
  metadata?: Record<string, unknown>;
}

const STORAGE_KEY = 'bahati_collection_submission_audit';
const MAX_ENTRIES = 100;

function canUseStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

export function appendCollectionSubmissionAudit(entry: CollectionSubmissionAuditEntry): void {
  const nextEntry = { ...entry, timestamp: entry.timestamp || new Date().toISOString() };

  try {
    if (canUseStorage()) {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      const existing = raw ? (JSON.parse(raw) as CollectionSubmissionAuditEntry[]) : [];
      const next = [nextEntry, ...existing].slice(0, MAX_ENTRIES);
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    }
  } catch {
    // best-effort only
  }

  try {
    console.warn('[collection-audit]', nextEntry);
  } catch {
    // ignore console failures
  }
}

export function getCollectionSubmissionAudit(): CollectionSubmissionAuditEntry[] {
  try {
    if (!canUseStorage()) return [];
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as CollectionSubmissionAuditEntry[]) : [];
  } catch {
    return [];
  }
}

export function clearCollectionSubmissionAudit(): void {
  try {
    if (canUseStorage()) {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // ignore
  }
}
