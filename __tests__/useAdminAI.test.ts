/**
 * __tests__/useAdminAI.test.ts
 *
 * Tests for hooks/useAdminAI.ts — AI log query hook (297L).
 *
 * Core paths covered:
 *  1. Initial state — empty messages, not loading, callbacks exposed
 *  2. Snapshot computation — basic fields from input data
 *  3. Alerts — urgent (pending settlements), warning (anomalies, missing collections,
 *     unsynced), info (inactive drivers, debt)
 *  4. sendMessage — success, API error response, network failure
 *  5. clearHistory — clears message array
 *  6. isLoading — transitions during sendMessage lifecycle
 */
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { renderHook, act, waitFor } from '@testing-library/react';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const TODAY = '2026-05-20';

jest.mock('../utils/dateUtils', () => ({
  getTodayLocalDate: () => TODAY,
}));

jest.mock('../utils/locationWorkflow', () => ({
  getLocationDeletionDiagnostics: jest.fn(() => ({
    blockers: [],
    warnings: [],
    related: {
      totalTransactions: 0,
      pendingApprovalTransactions: 0,
      unsettledCollections: 0,
      pendingResetRequests: 0,
      pendingPayoutRequests: 0,
    },
  })),
}));

// Mock global fetch
const mockFetch = jest.fn<typeof fetch>();
global.fetch = mockFetch as unknown as typeof fetch;

// Polyfill Response for jsdom (not available in jsdom global scope)
if (typeof global.Response === 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-extraneous-class
  (global as any).Response = class {
    readonly body: string;
    readonly status: number;
    readonly headers: Headers;
    constructor(body: string, init?: { status?: number; headers?: Record<string, string> }) {
      this.body = body;
      this.status = init?.status ?? 200;
      this.headers = new Headers(init?.headers);
    }
    async json() {
      return JSON.parse(this.body);
    }
  };
}

// ─── Static import (after jest.mock hoisting) ─────────────────────────────────

import { useAdminAI } from '../hooks/useAdminAI';

import type { Location, Driver, Transaction, DailySettlement } from '../types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeLocation(overrides: Partial<Location> = {}): Location {
  return {
    id: 'loc-1',
    name: 'Shop A',
    machineId: 'MC-001',
    lastScore: 5000,
    area: 'City',
    initialStartupDebt: 0,
    remainingStartupDebt: 0,
    commissionRate: 0.1,
    status: 'active',
    ...overrides,
  };
}

function makeDriver(overrides: Partial<Driver> = {}): Driver {
  return {
    id: 'drv-1',
    name: 'Alice',
    username: 'alice',
    phone: '255700000001',
    initialDebt: 0,
    remainingDebt: 0,
    dailyFloatingCoins: 0,
    vehicleInfo: { model: 'Bajaj', plate: 'T123ABC' },
    status: 'active',
    baseSalary: 100000,
    commissionRate: 0.1,
    ...overrides,
  };
}

function makeTransaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 'tx-1',
    timestamp: `${TODAY}T08:00:00Z`,
    locationId: 'loc-1',
    locationName: 'Shop A',
    driverId: 'drv-1',
    driverName: 'Alice',
    previousScore: 4800,
    currentScore: 5000,
    revenue: 200,
    commission: 20,
    ownerRetention: 0,
    debtDeduction: 0,
    startupDebtDeduction: 0,
    expenses: 0,
    coinExchange: 0,
    extraIncome: 0,
    netPayable: 180,
    gps: { lat: -6.8, lng: 39.2 },
    dataUsageKB: 0.5,
    isSynced: true,
    type: 'collection',
    isAnomaly: false,
    ...overrides,
  };
}

function makeSettlement(overrides: Partial<DailySettlement> = {}): DailySettlement {
  return {
    id: 'set-1',
    date: TODAY,
    driverId: 'drv-1',
    driverName: 'Alice',
    totalRevenue: 200,
    totalNetPayable: 180,
    totalExpenses: 0,
    driverFloat: 0,
    expectedTotal: 180,
    actualCash: 180,
    actualCoins: 0,
    shortage: 0,
    timestamp: `${TODAY}T10:00:00Z`,
    status: 'confirmed',
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockFetch.mockReset();
});

afterEach(() => {
  jest.restoreAllMocks();
});

// ══ initial state ═════════════════════════════════════════════════════════════

describe('useAdminAI — initial state', () => {
  it('returns empty messages, not loading, and exposes callbacks', () => {
    const { result } = renderHook(() => useAdminAI([], [], [], []));

    expect(result.current.messages).toEqual([]);
    expect(result.current.isLoading).toBe(false);
    expect(typeof result.current.sendMessage).toBe('function');
    expect(typeof result.current.clearHistory).toBe('function');
    expect(result.current.alerts).toBeDefined();
    expect(result.current.snapshot).toBeDefined();
    expect(result.current.alertCount).toBe(0);
  });
});

// ══ snapshot computation ═══════════════════════════════════════════════════════

describe('useAdminAI — snapshot computation', () => {
  it('computes basic fields from input data', () => {
    const locs = [makeLocation(), makeLocation({ id: 'loc-2', status: 'inactive' })];
    const drvs = [makeDriver(), makeDriver({ id: 'drv-2', status: 'inactive' })];
    const txns = [
      makeTransaction(),
      makeTransaction({ id: 'tx-2', revenue: 300 }),
    ];

    const { result } = renderHook(() => useAdminAI(locs, drvs, txns, []));

    const snap = result.current.snapshot;
    expect(snap.today).toBe(TODAY);
    expect(snap.totalLocations).toBe(2);
    expect(snap.activeLocations).toBe(1);
    expect(snap.totalDrivers).toBe(2);
    expect(snap.activeDrivers).toBe(1);
    expect(snap.todayCollections).toBe(2);
    expect(snap.todayRevenue).toBe(500);
    expect(snap.anomalyCount).toBe(0);
    expect(snap.pendingSettlements).toBe(0);
    expect(snap.unsyncedCount).toBe(0);
    expect(snap.debtLocations).toBe(0);
    expect(snap.totalDebt).toBe(0);
  });

  it('detects anomalies and unsynced transactions', () => {
    const txns = [
      makeTransaction(),
      makeTransaction({ id: 'tx-2', isAnomaly: true, notes: '可疑' }),
      makeTransaction({ id: 'tx-3', isSynced: false }),
    ];

    const { result } = renderHook(() => useAdminAI([makeLocation()], [makeDriver()], txns, []));

    expect(result.current.snapshot.anomalyCount).toBe(1);
    expect(result.current.snapshot.unsyncedCount).toBe(1);
    expect(result.current.snapshot.topAnomalies).toHaveLength(1);
    expect(result.current.snapshot.topAnomalies[0].note).toBe('可疑');
  });

  it('detects locations not collected and drivers with no collection today', () => {
    const locs = [
      makeLocation({ id: 'loc-1' }),
      makeLocation({ id: 'loc-2', name: 'Shop B', machineId: 'MC-002' }),
    ];
    const drvs = [
      makeDriver({ id: 'drv-1' }),
      makeDriver({ id: 'drv-2', name: 'Bob' }),
    ];
    // Only loc-1 / drv-1 has a transaction today
    const txns = [makeTransaction({ locationId: 'loc-1', driverId: 'drv-1' })];

    const { result } = renderHook(() => useAdminAI(locs, drvs, txns, []));

    expect(result.current.snapshot.locationsNotCollectedToday).toContain('MC-002');
    expect(result.current.snapshot.driversWithNoCollectionToday).toContain('Bob');
  });

  it('filters out expense-type transactions from revenue', () => {
    const txns = [
      makeTransaction({ revenue: 200 }),
      makeTransaction({ id: 'tx-2', type: 'expense', revenue: 100 }),
    ];

    const { result } = renderHook(() => useAdminAI([makeLocation()], [makeDriver()], txns, []));

    expect(result.current.snapshot.todayCollections).toBe(1);
    expect(result.current.snapshot.todayRevenue).toBe(200);
  });
});

// ══ alerts ════════════════════════════════════════════════════════════════════

describe('useAdminAI — alerts generation', () => {
  it('generates urgent alert for pending settlements', () => {
    const sets = [makeSettlement({ status: 'pending' })];

    const { result } = renderHook(() => useAdminAI(
      [makeLocation()], [makeDriver()], [makeTransaction()], sets,
    ));

    expect(result.current.alerts).toHaveLength(1);
    expect(result.current.alerts[0].id).toBe('pending-settlements');
    expect(result.current.alerts[0].level).toBe('urgent');
    expect(result.current.alertCount).toBe(1);
  });

  it('generates warning alert for anomalies', () => {
    const txns = [makeTransaction({ isAnomaly: true })];

    const { result } = renderHook(() => useAdminAI([makeLocation()], [makeDriver()], txns, []));

    const anomalyAlert = result.current.alerts.find((a) => a.id === 'anomalies');
    expect(anomalyAlert).toBeDefined();
    expect(anomalyAlert!.level).toBe('warning');
    expect(result.current.alertCount).toBe(1);
  });

  it('generates info for < 3 missing collections, warning for >= 3', () => {
    // Case 1: 2 missing → info
    const locsInfo = [
      makeLocation({ id: 'loc-1' }),
      makeLocation({ id: 'loc-2', machineId: 'MC-002' }),
      makeLocation({ id: 'loc-3', machineId: 'MC-003' }),
    ];
    const txnsInfo = [makeTransaction({ locationId: 'loc-1' })];

    const { result: rInfo } = renderHook(() =>
      useAdminAI(locsInfo, [makeDriver()], txnsInfo, []),
    );
    const missingInfo = rInfo.current.alerts.find((a) => a.id === 'missing-collections');
    expect(missingInfo).toBeDefined();
    expect(missingInfo!.level).toBe('info'); // 2 < 3 → info

    // Case 2: 3 missing → warning
    const locsWarn = [
      makeLocation({ id: 'loc-1' }),
      makeLocation({ id: 'loc-2', machineId: 'MC-002' }),
      makeLocation({ id: 'loc-3', machineId: 'MC-003' }),
      makeLocation({ id: 'loc-4', machineId: 'MC-004' }),
    ];
    const txnsWarn = [makeTransaction({ locationId: 'loc-1' })];

    const { result: rWarn } = renderHook(() =>
      useAdminAI(locsWarn, [makeDriver()], txnsWarn, []),
    );
    const missingWarn = rWarn.current.alerts.find((a) => a.id === 'missing-collections');
    expect(missingWarn).toBeDefined();
    expect(missingWarn!.level).toBe('warning'); // 3 >= 3 → warning
  });

  it('generates info alert for inactive drivers', () => {
    const drvs = [
      makeDriver({ id: 'drv-1' }),
      makeDriver({ id: 'drv-2', name: 'Bob' }),
    ];
    const txns = [makeTransaction({ driverId: 'drv-1' })];

    const { result } = renderHook(() => useAdminAI([makeLocation()], drvs, txns, []));

    const inactiveAlert = result.current.alerts.find((a) => a.id === 'inactive-drivers');
    expect(inactiveAlert).toBeDefined();
    expect(inactiveAlert!.level).toBe('info');
  });

  it('generates warning for unsynced > 5', () => {
    const txns = Array.from({ length: 6 }, (_, i) =>
      makeTransaction({ id: `tx-${i}`, isSynced: false }),
    );

    const { result } = renderHook(() => useAdminAI([makeLocation()], [makeDriver()], txns, []));

    const unsyncedAlert = result.current.alerts.find((a) => a.id === 'unsynced');
    expect(unsyncedAlert).toBeDefined();
    expect(unsyncedAlert!.level).toBe('warning');
  });

  it('does NOT generate unsynced alert when unsynced <= 5', () => {
    const txns = Array.from({ length: 5 }, (_, i) =>
      makeTransaction({ id: `tx-${i}`, isSynced: false }),
    );

    const { result } = renderHook(() => useAdminAI([makeLocation()], [makeDriver()], txns, []));

    expect(result.current.alerts.find((a) => a.id === 'unsynced')).toBeUndefined();
  });

  it('generates info alert for debt locations', () => {
    const locs = [makeLocation({ remainingStartupDebt: 50000 })];

    const { result } = renderHook(() => useAdminAI(locs, [makeDriver()], [], []));

    const debtAlert = result.current.alerts.find((a) => a.id === 'debt');
    expect(debtAlert).toBeDefined();
    expect(debtAlert!.level).toBe('info');
  });

  it('generates no alerts when everything is clean', () => {
    const { result } = renderHook(() => useAdminAI(
      [makeLocation()],
      [makeDriver()],
      [makeTransaction()],
      [makeSettlement()],
    ));

    expect(result.current.alerts).toHaveLength(0);
    expect(result.current.alertCount).toBe(0);
  });
});

// ══ sendMessage ═══════════════════════════════════════════════════════════════

describe('useAdminAI — sendMessage', () => {
  it('adds user message and assistant reply on successful API call', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ reply: '今日营业额500 TZS' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const { result } = renderHook(() => useAdminAI(
      [makeLocation()], [makeDriver()], [makeTransaction()], [],
    ));

    await act(async () => {
      await result.current.sendMessage('今日营业额');
    });

    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages[0]).toEqual({ role: 'user', content: '今日营业额' });
    expect(result.current.messages[1]).toEqual({
      role: 'assistant',
      content: '今日营业额500 TZS',
    });
    expect(result.current.isLoading).toBe(false);

    // Verify fetch was called with correct body
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('/api/admin-ai');
    expect(init!.method).toBe('POST');
    const body = JSON.parse(init!.body as string);
    expect(body.message).toBe('今日营业额');
    expect(body.history).toEqual([]);
    expect(body.snapshot).toBeDefined();
  });

  it('shows error message when API returns error field', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: '未配置AI API Key' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const { result } = renderHook(() => useAdminAI([], [], [], []));

    await act(async () => {
      await result.current.sendMessage('hello');
    });

    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages[1].content).toContain('⚠️ AI 服务暂不可用');
    expect(result.current.messages[1].content).toContain('未配置AI API Key');
  });

  it('shows failure message when fetch throws network error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Failed to fetch'));

    const { result } = renderHook(() => useAdminAI([], [], [], []));

    await act(async () => {
      await result.current.sendMessage('hello');
    });

    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages[1].content).toContain('请求失败');
    expect(result.current.messages[1].content).toContain('Failed to fetch');
  });

  it('shows failure message for non-Error thrown objects', async () => {
    mockFetch.mockRejectedValueOnce('network down');

    const { result } = renderHook(() => useAdminAI([], [], [], []));

    await act(async () => {
      await result.current.sendMessage('hello');
    });

    expect(result.current.messages[1].content).toContain('网络错误');
  });

  it('sets isLoading during the API call lifecycle', async () => {
    // Use a deferred promise to check intermediate state
    let resolveFetch: (v: Response) => void;
    const deferred = new Promise<Response>((r) => { resolveFetch = r; });
    mockFetch.mockReturnValueOnce(deferred as any);

    const { result } = renderHook(() => useAdminAI([], [], [], []));

    let sendPromise: Promise<void>;
    await act(async () => {
      sendPromise = result.current.sendMessage('hello');
      // isLoading should be true before resolve
    });

    expect(result.current.isLoading).toBe(true);

    // Resolve the fetch
    await act(async () => {
      resolveFetch!(
        new Response(JSON.stringify({ reply: 'ok' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
      await sendPromise!;
    });

    expect(result.current.isLoading).toBe(false);
  });
});

// ══ clearHistory ══════════════════════════════════════════════════════════════

describe('useAdminAI — clearHistory', () => {
  it('clears all messages', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ reply: 'ok' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const { result } = renderHook(() => useAdminAI([], [], [], []));

    await act(async () => {
      await result.current.sendMessage('hello');
    });
    expect(result.current.messages).toHaveLength(2);

    act(() => {
      result.current.clearHistory();
    });

    expect(result.current.messages).toHaveLength(0);
  });
});
