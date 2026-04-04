/**
 * __tests__/collectionSubmissionAudit.test.ts
 *
 * Tests for services/collectionSubmissionAudit.ts
 *
 * Covers:
 *   - appendCollectionSubmissionAudit: stores entries in localStorage, caps at MAX_ENTRIES,
 *     fills missing timestamp, handles corrupted storage, and no-ops gracefully
 *   - getCollectionSubmissionAudit: reads and parses localStorage, returns [] on empty / corrupt
 *   - clearCollectionSubmissionAudit: removes the storage key
 */
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

import {
  appendCollectionSubmissionAudit,
  getCollectionSubmissionAudit,
  clearCollectionSubmissionAudit,
  type CollectionSubmissionAuditEntry,
} from '../services/collectionSubmissionAudit';

const STORAGE_KEY = 'bahati_collection_submission_audit';

function makeEntry(overrides: Partial<CollectionSubmissionAuditEntry> = {}): CollectionSubmissionAuditEntry {
  return {
    timestamp: '2026-01-01T00:00:00.000Z',
    event: 'submit_attempt',
    txId: 'tx-1',
    locationId: 'loc-1',
    locationName: 'Shop A',
    driverId: 'drv-1',
    ...overrides,
  };
}

beforeEach(() => {
  localStorage.clear();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

// ══ appendCollectionSubmissionAudit ══════════════════════════════════════════

describe('appendCollectionSubmissionAudit()', () => {
  it('stores a single entry in localStorage', () => {
    const entry = makeEntry();
    appendCollectionSubmissionAudit(entry);

    const raw = localStorage.getItem(STORAGE_KEY);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!) as CollectionSubmissionAuditEntry[];
    expect(parsed).toHaveLength(1);
    expect(parsed[0].event).toBe('submit_attempt');
    expect(parsed[0].txId).toBe('tx-1');
  });

  it('prepends new entries (most-recent first)', () => {
    appendCollectionSubmissionAudit(makeEntry({ txId: 'tx-1', timestamp: '2026-01-01T00:00:00.000Z' }));
    appendCollectionSubmissionAudit(makeEntry({ txId: 'tx-2', timestamp: '2026-01-01T01:00:00.000Z' }));

    const entries = getCollectionSubmissionAudit();
    expect(entries[0].txId).toBe('tx-2');
    expect(entries[1].txId).toBe('tx-1');
  });

  it('fills in a timestamp when the entry has none', () => {
    const entry: CollectionSubmissionAuditEntry = {
      timestamp: '',
      event: 'submit_server_success',
    };
    const before = Date.now();
    appendCollectionSubmissionAudit(entry);
    const after = Date.now();

    const entries = getCollectionSubmissionAudit();
    const saved = new Date(entries[0].timestamp).getTime();
    expect(saved).toBeGreaterThanOrEqual(before);
    expect(saved).toBeLessThanOrEqual(after);
  });

  it('caps the stored list at 100 entries', () => {
    for (let i = 0; i < 105; i++) {
      appendCollectionSubmissionAudit(makeEntry({ txId: `tx-${i}` }));
    }

    const entries = getCollectionSubmissionAudit();
    expect(entries).toHaveLength(100);
    // Most-recent entry is the last one appended
    expect(entries[0].txId).toBe('tx-104');
  });

  it('logs the entry to console.warn', () => {
    appendCollectionSubmissionAudit(makeEntry({ event: 'queue_flush_success' }));
    expect(console.warn).toHaveBeenCalledWith(
      '[collection-audit]',
      expect.objectContaining({ event: 'queue_flush_success' }),
    );
  });

  it('handles corrupted localStorage gracefully (does not throw)', () => {
    localStorage.setItem(STORAGE_KEY, 'not-valid-json');
    expect(() => appendCollectionSubmissionAudit(makeEntry())).not.toThrow();
  });

  it('stores all optional fields when provided', () => {
    const entry = makeEntry({
      event: 'submit_invalid_score',
      currentScoreRaw: '999',
      resolvedScore: 999,
      previousScore: 800,
      source: 'server',
      reason: 'anomaly detected',
      metadata: { extra: true },
    });
    appendCollectionSubmissionAudit(entry);

    const entries = getCollectionSubmissionAudit();
    expect(entries[0].currentScoreRaw).toBe('999');
    expect(entries[0].resolvedScore).toBe(999);
    expect(entries[0].source).toBe('server');
    expect(entries[0].reason).toBe('anomaly detected');
    expect(entries[0].metadata).toEqual({ extra: true });
  });

  it('works with all event types without throwing', () => {
    const events: CollectionSubmissionAuditEntry['event'][] = [
      'submit_attempt',
      'submit_server_success',
      'submit_server_failure',
      'submit_offline_enqueued',
      'submit_invalid_score',
      'queue_flush_success',
      'queue_flush_failure',
    ];
    for (const event of events) {
      expect(() => appendCollectionSubmissionAudit(makeEntry({ event }))).not.toThrow();
    }
    expect(getCollectionSubmissionAudit()).toHaveLength(events.length);
  });
});

// ══ getCollectionSubmissionAudit ══════════════════════════════════════════════

describe('getCollectionSubmissionAudit()', () => {
  it('returns an empty array when localStorage is empty', () => {
    expect(getCollectionSubmissionAudit()).toEqual([]);
  });

  it('returns entries previously stored via appendCollectionSubmissionAudit', () => {
    appendCollectionSubmissionAudit(makeEntry({ txId: 'tx-10', event: 'submit_server_success' }));
    const entries = getCollectionSubmissionAudit();
    expect(entries).toHaveLength(1);
    expect(entries[0].txId).toBe('tx-10');
  });

  it('returns an empty array when localStorage contains corrupted JSON', () => {
    localStorage.setItem(STORAGE_KEY, 'corrupted{[}');
    expect(getCollectionSubmissionAudit()).toEqual([]);
  });

  it('returns an empty array when the key holds an empty array string', () => {
    localStorage.setItem(STORAGE_KEY, '[]');
    expect(getCollectionSubmissionAudit()).toEqual([]);
  });
});

// ══ clearCollectionSubmissionAudit ════════════════════════════════════════════

describe('clearCollectionSubmissionAudit()', () => {
  it('removes all stored entries', () => {
    appendCollectionSubmissionAudit(makeEntry());
    clearCollectionSubmissionAudit();
    expect(getCollectionSubmissionAudit()).toEqual([]);
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('does not throw when the storage key does not exist', () => {
    expect(() => clearCollectionSubmissionAudit()).not.toThrow();
  });

  it('allows fresh entries to be appended after clearing', () => {
    appendCollectionSubmissionAudit(makeEntry({ txId: 'tx-old' }));
    clearCollectionSubmissionAudit();
    appendCollectionSubmissionAudit(makeEntry({ txId: 'tx-new' }));

    const entries = getCollectionSubmissionAudit();
    expect(entries).toHaveLength(1);
    expect(entries[0].txId).toBe('tx-new');
  });
});
