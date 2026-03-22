/**
 * __tests__/types.test.ts
 * Tests for the utility functions exported from types.ts.
 */

import { describe, it, expect } from '@jest/globals';
import {
  safeRandomUUID, isLikelyEmail, getDistance, CONSTANTS,
  ApprovalStatus, ExpenseStatus, PaymentStatus, SettlementStatus,
  TransactionType, LocationStatus,
} from '../types';

// ── safeRandomUUID ─────────────────────────────────────────────────────────────

describe('safeRandomUUID()', () => {
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  it('returns a string in UUID v4 format', () => {
    const id = safeRandomUUID();
    expect(typeof id).toBe('string');
    expect(UUID_RE.test(id)).toBe(true);
  });

  it('generates unique values on consecutive calls', () => {
    const ids = new Set(Array.from({ length: 50 }, () => safeRandomUUID()));
    expect(ids.size).toBe(50);
  });

  it('falls back to polyfill when crypto.randomUUID is unavailable', () => {
    const originalRandomUUID = crypto.randomUUID;
    crypto.randomUUID = undefined as any;

    const id = safeRandomUUID();
    expect(UUID_RE.test(id)).toBe(true);

    // Restore
    crypto.randomUUID = originalRandomUUID;
  });
});

// ── isLikelyEmail ──────────────────────────────────────────────────────────────

describe('isLikelyEmail()', () => {
  it('accepts valid email addresses', () => {
    expect(isLikelyEmail('user@example.com')).toBe(true);
    expect(isLikelyEmail('admin@bahati.co.tz')).toBe(true);
    expect(isLikelyEmail('driver+1@mail.org')).toBe(true);
    expect(isLikelyEmail('  padded@email.io  ')).toBe(true); // trim is applied
  });

  it('rejects invalid email strings', () => {
    expect(isLikelyEmail('')).toBe(false);
    expect(isLikelyEmail('notanemail')).toBe(false);
    expect(isLikelyEmail('@nodomain')).toBe(false);
    expect(isLikelyEmail('missing@')).toBe(false);
    expect(isLikelyEmail('space in@email.com')).toBe(false);
  });
});

// ── getDistance ────────────────────────────────────────────────────────────────

describe('getDistance()', () => {
  it('returns 0 for identical coordinates', () => {
    expect(getDistance(-6.8, 39.3, -6.8, 39.3)).toBe(0);
  });

  it('calculates the distance between Dar es Salaam and Nairobi (~670 km)', () => {
    // Dar es Salaam: -6.7924, 39.2083
    // Nairobi:       -1.2921, 36.8219
    const dist = getDistance(-6.7924, 39.2083, -1.2921, 36.8219);
    // Accept ±50 km tolerance
    expect(dist).toBeGreaterThan(600_000);
    expect(dist).toBeLessThan(750_000);
  });

  it('returns a positive number for any two distinct points', () => {
    const d = getDistance(0, 0, 1, 1);
    expect(d).toBeGreaterThan(0);
  });

  it('is symmetric — distance A→B equals B→A', () => {
    const d1 = getDistance(-6.8, 39.3, -1.3, 36.8);
    const d2 = getDistance(-1.3, 36.8, -6.8, 39.3);
    expect(Math.abs(d1 - d2)).toBeLessThan(0.001); // floating-point safe
  });
});

// ── CONSTANTS ─────────────────────────────────────────────────────────────────

describe('CONSTANTS', () => {
  it('COIN_VALUE_TZS is 200', () => {
    expect(CONSTANTS.COIN_VALUE_TZS).toBe(200);
  });

  it('STORAGE_NOTIFICATIONS_KEY is defined and non-empty', () => {
    expect(typeof CONSTANTS.STORAGE_NOTIFICATIONS_KEY).toBe('string');
    expect(CONSTANTS.STORAGE_NOTIFICATIONS_KEY.length).toBeGreaterThan(0);
  });
});

// ── Domain Constants ─────────────────────────────────────────────────────────

describe('Domain status constants', () => {
  it('ApprovalStatus has all expected values', () => {
    expect(ApprovalStatus.AUTO_APPROVED).toBe('auto-approved');
    expect(ApprovalStatus.PENDING).toBe('pending');
    expect(ApprovalStatus.APPROVED).toBe('approved');
    expect(ApprovalStatus.REJECTED).toBe('rejected');
  });

  it('ExpenseStatus has all expected values', () => {
    expect(ExpenseStatus.PENDING).toBe('pending');
    expect(ExpenseStatus.APPROVED).toBe('approved');
    expect(ExpenseStatus.REJECTED).toBe('rejected');
  });

  it('PaymentStatus has all expected values', () => {
    expect(PaymentStatus.UNPAID).toBe('unpaid');
    expect(PaymentStatus.PENDING).toBe('pending');
    expect(PaymentStatus.PAID).toBe('paid');
    expect(PaymentStatus.REJECTED).toBe('rejected');
  });

  it('SettlementStatus has all expected values', () => {
    expect(SettlementStatus.PENDING).toBe('pending');
    expect(SettlementStatus.CONFIRMED).toBe('confirmed');
    expect(SettlementStatus.REJECTED).toBe('rejected');
  });

  it('TransactionType has all expected values', () => {
    expect(TransactionType.COLLECTION).toBe('collection');
    expect(TransactionType.EXPENSE).toBe('expense');
    expect(TransactionType.RESET_REQUEST).toBe('reset_request');
    expect(TransactionType.PAYOUT_REQUEST).toBe('payout_request');
  });

  it('LocationStatus has all expected values', () => {
    expect(LocationStatus.ACTIVE).toBe('active');
    expect(LocationStatus.MAINTENANCE).toBe('maintenance');
    expect(LocationStatus.BROKEN).toBe('broken');
  });
});
