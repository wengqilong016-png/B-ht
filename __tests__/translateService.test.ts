/**
 * __tests__/translateService.test.ts
 *
 * Tests for services/translateService.ts
 *
 * The service makes a fetch call to the same-origin translation API.
 * We mock global fetch to control responses without network access.
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

// ── fetch mock ──────────────────────────────────────────────────────────────
const mockFetch = jest.fn<typeof fetch>();

beforeEach(() => {
  jest.clearAllMocks();
  // @ts-ignore
  global.fetch = mockFetch;
});

afterEach(() => {
  // @ts-ignore
  delete global.fetch;
});

import { translateToChinese } from '../services/translateService';

// ──────────────────────────────────────────────────────────────────────────────

describe('translateToChinese()', () => {
  it('returns the original text unchanged when text is empty', async () => {
    const result = await translateToChinese('');
    expect(result).toBe('');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('returns the original text unchanged when text is only whitespace', async () => {
    const result = await translateToChinese('   ');
    expect(result).toBe('   ');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('returns translated text on successful API response', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        translatedText: '你好',
      }),
    } as Response);

    const result = await translateToChinese('Hello');
    expect(result).toBe('你好');
  });

  it('returns original text when API response lacks translated text', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        translatedText: '',
      }),
    } as Response);

    const result = await translateToChinese('Hello');
    // falsy translatedText — falls back to original
    expect(result).toBe('Hello');
  });

  it('returns original text when fetch throws a network error', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'));

    const result = await translateToChinese('Hello');
    expect(result).toBe('Hello');
  });

  it('returns original text when response JSON parsing fails', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => { throw new Error('Invalid JSON'); },
    } as unknown as Response);

    const result = await translateToChinese('Hello');
    expect(result).toBe('Hello');
  });

  it('calls the translation API with the provided text', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        translatedText: '世界',
      }),
    } as Response);

    await translateToChinese('World');

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [urlArg, initArg] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(urlArg).toBe('/api/translate');
    const body = JSON.parse(initArg.body as string);
    expect(body.text).toBe('World');
    expect(body.target).toBe('zh');
  });

  it('returns original text when HTTP response is not ok (e.g. 500)', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({}),
    } as unknown as Response);

    const result = await translateToChinese('Hello');
    expect(result).toBe('Hello');
  });
});
