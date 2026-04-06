/**
 * __tests__/dateUtils.test.ts
 * Tests for utils/dateUtils.ts — Tanzania time-zone aware date helpers.
 */
import { describe, it, expect } from '@jest/globals';
import { getTodayLocalDate } from '../utils/dateUtils';

describe('getTodayLocalDate()', () => {
  const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

  it('returns a string matching YYYY-MM-DD', () => {
    const result = getTodayLocalDate();
    expect(result).toMatch(ISO_DATE_RE);
  });

  it('returns the correct date in Tanzania time zone (Africa/Dar_es_Salaam)', () => {
    const result = getTodayLocalDate('Africa/Dar_es_Salaam');
    // Cross-check using Intl.DateTimeFormat directly
    const expected = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Africa/Dar_es_Salaam',
    }).format(new Date());
    expect(result).toBe(expected);
  });

  it('returns the correct date for a custom time zone (UTC)', () => {
    const result = getTodayLocalDate('UTC');
    const expected = new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC' }).format(new Date());
    expect(result).toBe(expected);
  });

  it('returns the correct date for US/Pacific time zone', () => {
    const result = getTodayLocalDate('America/Los_Angeles');
    const expected = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Los_Angeles',
    }).format(new Date());
    expect(result).toBe(expected);
  });

  it('returns a date string with month zero-padded', () => {
    const result = getTodayLocalDate('UTC');
    const [, month] = result.split('-');
    expect(month.length).toBe(2);
  });

  it('returns a date string with day zero-padded', () => {
    const result = getTodayLocalDate('UTC');
    const [, , day] = result.split('-');
    expect(day.length).toBe(2);
  });

  it('returns a 4-digit year', () => {
    const result = getTodayLocalDate('UTC');
    const [year] = result.split('-');
    expect(year.length).toBe(4);
    expect(Number(year)).toBeGreaterThanOrEqual(2024);
  });
});
