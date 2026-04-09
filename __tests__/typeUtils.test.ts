/**
 * __tests__/typeUtils.test.ts
 *
 * Additional tests for helpers in types/utils.ts that are not already
 * covered by __tests__/types.test.ts.
 */
import { describe, it, expect } from '@jest/globals';

import { getLocationField } from '../types';

import type { Location } from '../types';

// ── getLocationField ─────────────────────────────────────────────────────────

function makeLocation(extra: Record<string, unknown> = {}): Location {
  return {
    id: 'loc-001',
    name: 'Test Shop',
    machineId: 'MCH-001',
    lastScore: 500,
    area: 'Downtown',
    assignedDriverId: 'drv-001',
    ownerName: 'Owner A',
    shopOwnerPhone: '0711000000',
    ownerPhotoUrl: '',
    machinePhotoUrl: '',
    initialStartupDebt: 0,
    remainingStartupDebt: 0,
    isNewOffice: false,
    coords: { lat: -6.8, lng: 39.3 },
    status: 'active',
    lastRevenueDate: null,
    commissionRate: 15,
    resetLocked: false,
    dividendBalance: 0,
    isSynced: true,
    ...extra,
  } as unknown as Location;
}

describe('getLocationField()', () => {
  it('returns the value of a known field', () => {
    const loc = makeLocation();
    expect(getLocationField(loc, 'id')).toBe('loc-001');
    expect(getLocationField(loc, 'name')).toBe('Test Shop');
    expect(getLocationField(loc, 'lastScore')).toBe(500);
  });

  it('returns undefined for a field that does not exist', () => {
    const loc = makeLocation();
    expect(getLocationField(loc, 'nonExistentField')).toBeUndefined();
  });

  it('returns nested object values', () => {
    const loc = makeLocation();
    expect(getLocationField(loc, 'coords')).toEqual({ lat: -6.8, lng: 39.3 });
  });

  it('returns null for a null field', () => {
    const loc = makeLocation({ lastRevenueDate: null });
    expect(getLocationField(loc, 'lastRevenueDate')).toBeNull();
  });

  it('returns false for a boolean false field', () => {
    const loc = makeLocation({ isNewOffice: false });
    expect(getLocationField(loc, 'isNewOffice')).toBe(false);
  });

  it('returns 0 for a numeric zero field', () => {
    const loc = makeLocation({ dividendBalance: 0 });
    expect(getLocationField(loc, 'dividendBalance')).toBe(0);
  });
});
