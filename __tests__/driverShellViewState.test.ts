/**
 * __tests__/driverShellViewState.test.ts
 *
 * Tests for driver/driverShellViewState.ts
 */
import { describe, it, expect } from '@jest/globals';

import { resolveCurrentDriver } from '../driver/driverShellViewState';

import type { Driver } from '../types';

function makeDriver(id: string, name: string): Driver {
  return {
    id,
    name,
    username: id,
    phone: '',
    initialDebt: 0,
    remainingDebt: 0,
    dailyFloatingCoins: 100,
    vehicleInfo: '',
    currentGps: null,
    lastActive: null,
    status: 'active',
    baseSalary: 0,
    commissionRate: 15,
    isSynced: true,
  } as unknown as Driver;
}

describe('resolveCurrentDriver()', () => {
  const alice = makeDriver('drv-alice', 'Alice');
  const bob = makeDriver('drv-bob', 'Bob');

  it('returns the driver matching activeDriverId', () => {
    const result = resolveCurrentDriver([alice, bob], 'drv-bob');
    expect(result?.id).toBe('drv-bob');
  });

  it('falls back to the first driver when activeDriverId is not found', () => {
    const result = resolveCurrentDriver([alice, bob], 'drv-unknown');
    expect(result?.id).toBe('drv-alice');
  });

  it('falls back to the first driver when activeDriverId is undefined', () => {
    const result = resolveCurrentDriver([alice, bob], undefined);
    expect(result?.id).toBe('drv-alice');
  });

  it('returns undefined when drivers array is empty', () => {
    expect(resolveCurrentDriver([], undefined)).toBeUndefined();
  });

  it('returns undefined when drivers is empty and activeDriverId is provided', () => {
    expect(resolveCurrentDriver([], 'drv-alice')).toBeUndefined();
  });

  it('returns the only driver when there is exactly one', () => {
    const result = resolveCurrentDriver([alice], undefined);
    expect(result?.id).toBe('drv-alice');
  });

  it('returns driver by id even if not first in list', () => {
    const result = resolveCurrentDriver([alice, bob], 'drv-alice');
    expect(result?.id).toBe('drv-alice');
    expect(result?.name).toBe('Alice');
  });
});
