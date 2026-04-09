/**
 * __tests__/useDevicePerformance.test.ts
 *
 * Tests for hooks/useDevicePerformance.ts
 */
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { renderHook } from '@testing-library/react';

import { useDevicePerformance } from '../hooks/useDevicePerformance';

// Track original descriptor so we can restore it after each test
const originalDescriptors: Record<string, PropertyDescriptor | undefined> = {};

beforeEach(() => {
  delete document.documentElement.dataset.perf;
  for (const key of ['hardwareConcurrency', 'deviceMemory', 'connection']) {
    originalDescriptors[key] = Object.getOwnPropertyDescriptor(navigator, key);
  }
});

afterEach(() => {
  for (const [key, desc] of Object.entries(originalDescriptors)) {
    if (desc) {
      Object.defineProperty(navigator, key, desc);
    } else {
      try { delete (navigator as any)[key]; } catch { /* ignore */ }
    }
  }
});

function setNav(props: {
  hardwareConcurrency?: number;
  deviceMemory?: number;
  connection?: { effectiveType: string };
}) {
  Object.defineProperty(navigator, 'hardwareConcurrency', { configurable: true, get: () => props.hardwareConcurrency });
  Object.defineProperty(navigator, 'deviceMemory', { configurable: true, get: () => props.deviceMemory });
  Object.defineProperty(navigator, 'connection', { configurable: true, get: () => props.connection });
}

describe('useDevicePerformance()', () => {
  it('returns medium when no browser APIs are available', () => {
    setNav({});
    const { result } = renderHook(() => useDevicePerformance());
    expect(result.current).toBe('medium');
  });

  it('returns low when hardwareConcurrency ≤ 2', () => {
    setNav({ hardwareConcurrency: 2 });
    const { result } = renderHook(() => useDevicePerformance());
    expect(result.current).toBe('low');
  });

  it('returns low when deviceMemory ≤ 1', () => {
    setNav({ hardwareConcurrency: 8, deviceMemory: 1 });
    const { result } = renderHook(() => useDevicePerformance());
    expect(result.current).toBe('low');
  });

  it('returns low when connection is 2g', () => {
    setNav({ hardwareConcurrency: 8, connection: { effectiveType: '2g' } });
    const { result } = renderHook(() => useDevicePerformance());
    expect(result.current).toBe('low');
  });

  it('returns low when connection is slow-2g', () => {
    setNav({ hardwareConcurrency: 8, connection: { effectiveType: 'slow-2g' } });
    const { result } = renderHook(() => useDevicePerformance());
    expect(result.current).toBe('low');
  });

  it('returns medium when 4 cores', () => {
    setNav({ hardwareConcurrency: 4 });
    const { result } = renderHook(() => useDevicePerformance());
    expect(result.current).toBe('medium');
  });

  it('returns medium when deviceMemory is 2', () => {
    setNav({ hardwareConcurrency: 8, deviceMemory: 2 });
    const { result } = renderHook(() => useDevicePerformance());
    expect(result.current).toBe('medium');
  });

  it('returns medium when connection is 3g', () => {
    setNav({ hardwareConcurrency: 8, connection: { effectiveType: '3g' } });
    const { result } = renderHook(() => useDevicePerformance());
    expect(result.current).toBe('medium');
  });

  it('returns high when 8 cores, 4GB RAM, 4g connection', () => {
    setNav({ hardwareConcurrency: 8, deviceMemory: 4, connection: { effectiveType: '4g' } });
    const { result } = renderHook(() => useDevicePerformance());
    expect(result.current).toBe('high');
  });

  it('writes the detected tier to document.documentElement.dataset.perf', () => {
    setNav({ hardwareConcurrency: 8, deviceMemory: 4, connection: { effectiveType: '4g' } });
    renderHook(() => useDevicePerformance());
    expect(document.documentElement.dataset.perf).toBe('high');
  });
});
