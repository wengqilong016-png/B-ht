import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { renderHook, waitFor } from '@testing-library/react';

import { useAppUpdateCheck } from '../hooks/useAppUpdateCheck';

type GlobalWithVersion = typeof globalThis & {
  __APP_VERSION__?: string;
  fetch?: typeof fetch;
};

const mockFetch = jest.fn<typeof fetch>();

describe('useAppUpdateCheck', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    (globalThis as GlobalWithVersion).__APP_VERSION__ = '1.0.0';
    (globalThis as GlobalWithVersion).fetch = mockFetch;
  });

  afterEach(() => {
    Reflect.deleteProperty(globalThis, '__APP_VERSION__');
    Reflect.deleteProperty(globalThis, 'fetch');
  });

  it('returns null when the fetched version is not newer', async () => {
    mockFetch.mockResolvedValue({
      json: async () => ({
        version: '1.0.0',
        apkUrl: 'https://example.com/app.apk',
      }),
    } as Response);

    const { result } = renderHook(() => useAppUpdateCheck());

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/version.json', expect.objectContaining({
        cache: 'no-store',
      }));
    });

    await waitFor(() => {
      expect(result.current).toBeNull();
    });
  });

  it('returns update metadata when a newer version is available', async () => {
    mockFetch.mockResolvedValue({
      json: async () => ({
        version: '1.2.0',
        apkUrl: 'https://example.com/app-1.2.0.apk',
        releaseNotes: 'Bug fixes',
      }),
    } as Response);

    const { result } = renderHook(() => useAppUpdateCheck());

    await waitFor(() => {
      expect(result.current).toEqual({
        hasUpdate: true,
        latestVersion: '1.2.0',
        apkUrl: 'https://example.com/app-1.2.0.apk',
        releaseNotes: 'Bug fixes',
      });
    });
  });
});
