/**
 * __tests__/useGpsCapture.test.ts
 *
 * Tests for driver/hooks/useGpsCapture.ts
 */
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { renderHook, act } from '@testing-library/react';

import { useGpsCapture } from '../driver/hooks/useGpsCapture';
import type { GpsCoords } from '../driver/hooks/useGpsCapture';

// ── navigator.geolocation mock helpers ──────────────────────────────
const originalGeolocation = navigator.geolocation;

function mockGeolocation(getCurrentPosition: any) {
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    writable: true,
    value: { getCurrentPosition },
  });
}

function removeGeolocation() {
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    writable: true,
    value: undefined,
  });
}

function restoreGeolocation() {
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    writable: true,
    value: originalGeolocation,
  });
}

// ── test helpers ────────────────────────────────────────────────────
function makeSuccess(coords: GpsCoords) {
  const successCb: (pos: { coords: { latitude: number; longitude: number } }) => void = (_pos) => {};
  return (
    success: (pos: { coords: { latitude: number; longitude: number } }) => void,
    _error: any,
  ) => {
    setTimeout(() => success({ coords: { latitude: coords.lat, longitude: coords.lng } }), 0);
  };
}

function makeError(code: number) {
  return (
    _success: any,
    errorCb: (err: { code: number; PERMISSION_DENIED: number; TIMEOUT: number }) => void,
  ) => {
    const err: any = { code, PERMISSION_DENIED: 1, TIMEOUT: 3 };
    setTimeout(() => errorCb(err), 0);
  };
}

// ── tests ───────────────────────────────────────────────────────────
describe('useGpsCapture()', () => {
  afterEach(() => {
    restoreGeolocation();
  });

  // ── initial state ───────────────────────────────────────────────
  describe('initial state', () => {
    it('starts in idle with null coords when no initialCoords', () => {
      const { result } = renderHook(() => useGpsCapture());
      expect(result.current.status).toBe('idle');
      expect(result.current.coords).toBeNull();
    });

    it('starts in granted with provided coords when initialCoords given', () => {
      const initial: GpsCoords = { lat: -6.7924, lng: 39.2083 };
      const { result } = renderHook(() => useGpsCapture(initial));
      expect(result.current.status).toBe('granted');
      expect(result.current.coords).toEqual(initial);
    });

    it('starts in idle when initialCoords is null explicitly', () => {
      const { result } = renderHook(() => useGpsCapture(null));
      expect(result.current.status).toBe('idle');
      expect(result.current.coords).toBeNull();
    });
  });

  // ── navigator.geolocation absent ────────────────────────────────
  describe('when navigator.geolocation is unavailable', () => {
    beforeEach(() => {
      removeGeolocation();
    });

    it('request() immediately sets error and returns null', async () => {
      const { result } = renderHook(() => useGpsCapture());
      let captured: GpsCoords | null = undefined as any;

      await act(async () => {
        captured = await result.current.request();
      });

      expect(result.current.status).toBe('error');
      expect(result.current.coords).toBeNull();
      expect(captured).toBeNull();
    });
  });

  // ── successful acquisition ──────────────────────────────────────
  describe('successful GPS acquisition', () => {
    const mockCoords: GpsCoords = { lat: -6.7924, lng: 39.2083 };

    beforeEach(() => {
      mockGeolocation(makeSuccess(mockCoords));
    });

    it('request() transitions idle→requesting→granted and returns coords', async () => {
      const { result } = renderHook(() => useGpsCapture());
      expect(result.current.status).toBe('idle');

      let captured: GpsCoords | null = undefined as any;

      await act(async () => {
        captured = await result.current.request();
      });

      expect(result.current.status).toBe('granted');
      expect(result.current.coords).toEqual(mockCoords);
      expect(captured).toEqual(mockCoords);
    });

    it('request() updates coords on subsequent calls', async () => {
      const { result } = renderHook(() => useGpsCapture());
      const secondCoords: GpsCoords = { lat: -3.3723, lng: 36.6944 };

      await act(async () => {
        await result.current.request();
      });
      expect(result.current.coords).toEqual(mockCoords);

      // re-mock for second call
      mockGeolocation(makeSuccess(secondCoords));

      await act(async () => {
        await result.current.request();
      });
      expect(result.current.coords).toEqual(secondCoords);
    });
  });

  // ── error states ────────────────────────────────────────────────
  describe('error states', () => {
    it('request() sets denied on PERMISSION_DENIED and returns null', async () => {
      mockGeolocation(makeError(1)); // PERMISSION_DENIED = 1
      const { result } = renderHook(() => useGpsCapture());

      let captured: GpsCoords | null = undefined as any;
      await act(async () => {
        captured = await result.current.request();
      });

      expect(result.current.status).toBe('denied');
      expect(result.current.coords).toBeNull();
      expect(captured).toBeNull();
    });

    it('request() sets timeout on TIMEOUT and returns null', async () => {
      mockGeolocation(makeError(3)); // TIMEOUT = 3
      const { result } = renderHook(() => useGpsCapture());

      let captured: GpsCoords | null = undefined as any;
      await act(async () => {
        captured = await result.current.request();
      });

      expect(result.current.status).toBe('timeout');
      expect(result.current.coords).toBeNull();
      expect(captured).toBeNull();
    });

    it('request() sets error on POSITION_UNAVAILABLE (code 2) and returns null', async () => {
      mockGeolocation(makeError(2)); // POSITION_UNAVAILABLE
      const { result } = renderHook(() => useGpsCapture());

      let captured: GpsCoords | null = undefined as any;
      await act(async () => {
        captured = await result.current.request();
      });

      expect(result.current.status).toBe('error');
      expect(result.current.coords).toBeNull();
      expect(captured).toBeNull();
    });
  });
});
