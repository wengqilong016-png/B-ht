/**
 * __tests__/stripClientFields.test.ts
 *
 * Tests for utils/stripClientFields.ts
 */
import { describe, it, expect } from '@jest/globals';

import { stripClientFields } from '../utils/stripClientFields';

describe('stripClientFields()', () => {
  it('removes isSynced from an object', () => {
    const obj = { id: 'tx-1', revenue: 100, isSynced: false };
    const result = stripClientFields(obj as Record<string, unknown>);
    expect(result).not.toHaveProperty('isSynced');
  });

  it('removes stats from an object', () => {
    const obj = { id: 'tx-1', stats: { count: 5 }, revenue: 100 };
    const result = stripClientFields(obj as Record<string, unknown>);
    expect(result).not.toHaveProperty('stats');
  });

  it('removes both isSynced and stats when both present', () => {
    const obj = { id: 'tx-1', isSynced: true, stats: {}, revenue: 200 };
    const result = stripClientFields(obj as Record<string, unknown>);
    expect(result).not.toHaveProperty('isSynced');
    expect(result).not.toHaveProperty('stats');
  });

  it('preserves all other fields', () => {
    const obj = { id: 'tx-1', revenue: 500, commission: 75, isSynced: false };
    const result = stripClientFields(obj as Record<string, unknown>);
    expect(result.id).toBe('tx-1');
    expect(result.revenue).toBe(500);
    expect(result.commission).toBe(75);
  });

  it('does not mutate the original object', () => {
    const obj = { id: 'tx-1', isSynced: true };
    const original = { ...obj };
    stripClientFields(obj as Record<string, unknown>);
    expect(obj).toEqual(original);
  });

  it('handles an object without isSynced or stats gracefully', () => {
    const obj = { id: 'tx-2', revenue: 300 };
    const result = stripClientFields(obj as Record<string, unknown>);
    expect(result).toEqual({ id: 'tx-2', revenue: 300 });
  });

  it('handles an empty object', () => {
    const result = stripClientFields({});
    expect(result).toEqual({});
  });
});
