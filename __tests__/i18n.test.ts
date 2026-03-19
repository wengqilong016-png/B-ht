/**
 * __tests__/i18n.test.ts
 * Validates the i18n module: key parity between zh and sw, and value quality.
 */

import { describe, it, expect, beforeAll } from '@jest/globals';
import { TRANSLATIONS } from '../i18n';

describe('i18n — TRANSLATIONS object', () => {
  it('exports zh and sw language maps', () => {
    expect(TRANSLATIONS).toHaveProperty('zh');
    expect(TRANSLATIONS).toHaveProperty('sw');
  });

  it('each language map is a non-empty object', () => {
    expect(Object.keys(TRANSLATIONS.zh).length).toBeGreaterThan(0);
    expect(Object.keys(TRANSLATIONS.sw).length).toBeGreaterThan(0);
  });
});

describe('i18n — key parity between zh and sw', () => {
  let zhKeys: string[];
  let swKeys: string[];

  beforeAll(() => {
    zhKeys = Object.keys(TRANSLATIONS.zh).sort();
    swKeys = Object.keys(TRANSLATIONS.sw).sort();
  });

  it('zh and sw have the same number of keys', () => {
    expect(zhKeys.length).toBe(swKeys.length);
  });

  it('every key in zh is also present in sw', () => {
    const missing = zhKeys.filter(k => !(k in TRANSLATIONS.sw));
    expect(missing).toEqual([]);
  });

  it('every key in sw is also present in zh', () => {
    const missing = swKeys.filter(k => !(k in TRANSLATIONS.zh));
    expect(missing).toEqual([]);
  });
});

describe('i18n — translation value quality', () => {
  it('all zh values are non-empty strings', () => {
    const empty = Object.entries(TRANSLATIONS.zh).filter(([, v]) => typeof v !== 'string' || v.trim() === '');
    expect(empty).toEqual([]);
  });

  it('all sw values are non-empty strings', () => {
    const empty = Object.entries(TRANSLATIONS.sw).filter(([, v]) => typeof v !== 'string' || v.trim() === '');
    expect(empty).toEqual([]);
  });
});

describe('i18n — t() helper', () => {
  it('returns the correct translation for a known key', async () => {
    const { t } = await import('../i18n');
    expect(t('zh', 'login')).toBe(TRANSLATIONS.zh['login']);
    expect(t('sw', 'login')).toBe(TRANSLATIONS.sw['login']);
  });

  it('returns the key itself when the key is not found', async () => {
    const { t } = await import('../i18n');
    const unknownKey = '__nonexistent_key_xyz__';
    expect(t('zh', unknownKey)).toBe(unknownKey);
    expect(t('sw', unknownKey)).toBe(unknownKey);
  });
});
