import { describe, expect, it } from '@jest/globals';
import { renderHook } from '@testing-library/react';

import { useNextQueuedMachine } from '../driver/hooks/useNextQueuedMachine';

import type { Location, Transaction } from '../types';

const baseLocation = {
  machineId: '',
  area: '',
  ownerName: '',
  shopOwnerPhone: '',
  initialStartupDebt: 0,
  remainingStartupDebt: 0,
  isNewOffice: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  dividendBalance: 0,
} as const;

function makeLocation(overrides: Partial<Location>): Location {
  return {
    ...baseLocation,
    id: 'loc-default',
    name: 'Default',
    assignedDriverId: 'driver-1',
    coords: { lat: -6.8, lng: 39.2 },
    status: 'active',
    ...overrides,
  } as Location;
}

function makeTransaction(overrides: Partial<Transaction>): Transaction {
  return {
    id: 'tx-default',
    timestamp: '2026-04-23T10:00:00.000Z',
    locationId: 'loc-default',
    locationName: 'Default',
    driverId: 'driver-1',
    currentScore: 1200,
    netPayable: 0,
    isSynced: true,
    type: 'collection',
    ...overrides,
  } as Transaction;
}

describe('useNextQueuedMachine', () => {
  it('prefers assigned locations, excludes selected, and prioritizes pending urgent stops', () => {
    const locations: Location[] = [
      makeLocation({ id: 'loc-a', name: 'Alpha', assignedDriverId: 'driver-1', lastScore: 2000 }),
      makeLocation({ id: 'loc-b', name: 'Beta', assignedDriverId: 'driver-1', status: 'maintenance' }),
      makeLocation({ id: 'loc-c', name: 'Gamma', assignedDriverId: 'driver-1', lastScore: 1000 }),
      makeLocation({ id: 'loc-other', name: 'Other Driver', assignedDriverId: 'driver-2', lastScore: 9999 }),
    ];

    const transactions: Transaction[] = [
      makeTransaction({ id: 'tx-a', locationId: 'loc-a', timestamp: '2026-04-23T12:00:00.000Z', type: 'collection' }),
      makeTransaction({ id: 'tx-ignore-1', locationId: 'loc-b', timestamp: '2026-04-22T12:00:00.000Z', type: 'collection' }),
      makeTransaction({ id: 'tx-ignore-2', locationId: 'loc-b', timestamp: '2026-04-23T12:00:00.000Z', type: 'reset_request' }),
      makeTransaction({ id: 'tx-ignore-3', locationId: 'loc-b', timestamp: '2026-04-23T12:00:00.000Z', driverId: 'driver-2' }),
    ];

    const { result } = renderHook(() =>
      useNextQueuedMachine({
        locations,
        transactions,
        currentDriverId: 'driver-1',
        selectedLocationId: 'loc-c',
        todayStr: '2026-04-23',
      }),
    );

    expect(result.current.nextQueuedMachine?.id).toBe('loc-b');
    expect(result.current.remainingPendingStops).toBe(1);
  });

  it('falls back to all locations when no locations are assigned to current driver', () => {
    const locations: Location[] = [
      makeLocation({ id: 'loc-a', name: 'Alpha', assignedDriverId: 'driver-2' }),
      makeLocation({ id: 'loc-b', name: 'Beta', assignedDriverId: 'driver-3' }),
      makeLocation({ id: 'loc-c', name: 'Charlie', assignedDriverId: 'driver-4' }),
    ];

    const { result } = renderHook(() =>
      useNextQueuedMachine({
        locations,
        transactions: [],
        currentDriverId: 'driver-1',
        selectedLocationId: 'loc-a',
        todayStr: '2026-04-23',
      }),
    );

    expect(result.current.nextQueuedMachine?.id).toBe('loc-b');
    expect(result.current.remainingPendingStops).toBe(2);
  });

  it('returns the best available machine even when all non-selected stops were visited', () => {
    const locations: Location[] = [
      makeLocation({ id: 'loc-a', name: 'Alpha', assignedDriverId: 'driver-1' }),
      makeLocation({ id: 'loc-b', name: 'Beta', assignedDriverId: 'driver-1' }),
    ];

    const transactions: Transaction[] = [
      makeTransaction({ id: 'tx-b', locationId: 'loc-b', timestamp: '2026-04-23T09:00:00.000Z' }),
    ];

    const { result } = renderHook(() =>
      useNextQueuedMachine({
        locations,
        transactions,
        currentDriverId: 'driver-1',
        selectedLocationId: 'loc-a',
        todayStr: '2026-04-23',
      }),
    );

    expect(result.current.nextQueuedMachine?.id).toBe('loc-b');
    expect(result.current.remainingPendingStops).toBe(0);
  });
});
