import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { renderHook, waitFor } from '@testing-library/react';

import { useAppUpdateCheck } from '../hooks/useAppUpdateCheck';

jest.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: jest.fn(() => false),
  },
}));

type GlobalWithVersion = typeof globalThis & {
  __APP_VERSION__?: string;
  fetch?: typeof fetch;
};

const mockFetch = jest.fn<typeof fetch>();

describe('useAppUpdateCheck', () => {
  beforeEach(() => {
    jest.useRealTimers();
    mockFetch.mockReset();
    (globalThis as GlobalWithVersion).__APP_VERSION__ = '1.0.0';
    (globalThis as GlobalWithVersion).fetch = mockFetch;
  });

  afterEach(() => {
    jest.useRealTimers();
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
      const [url, init] = mockFetch.mock.calls[0] ?? [];
      expect(String(url)).toContain('/version.json');
      expect(init).toEqual(expect.objectContaining({
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
        versionCode: 123,
        gitSha: 'abc123',
        tag: 'v1.2.0',
        releasedAt: '2026-04-09T00:00:00Z',
        apkUrl: 'https://example.com/app-1.2.0.apk',
        releaseNotes: 'Bug fixes',
      }),
    } as Response);

    const { result } = renderHook(() => useAppUpdateCheck());

    await waitFor(() => {
      expect(result.current).toEqual({
        hasUpdate: true,
        latestVersion: '1.2.0',
        latestVersionCode: 123,
        latestGitSha: 'abc123',
        latestTag: 'v1.2.0',
        latestReleasedAt: '2026-04-09T00:00:00Z',
        apkUrl: 'https://example.com/app-1.2.0.apk',
        releaseNotes: 'Bug fixes',
      });
    });
  });

  it('polls for updates on native builds', async () => {
    jest.useFakeTimers();
    const { Capacitor } = jest.requireMock('@capacitor/core') as {
      Capacitor: { isNativePlatform: jest.Mock };
    };
    Capacitor.isNativePlatform.mockReturnValue(true);

    mockFetch.mockResolvedValue({
      json: async () => ({
        version: '1.0.0',
        apkUrl: 'https://example.com/app.apk',
      }),
    } as Response);

    renderHook(() => useAppUpdateCheck());

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    jest.advanceTimersByTime(15 * 60 * 1000);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });
});
