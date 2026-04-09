/**
 * __tests__/useCollectionSubmission.test.ts
 *
 * Tests for hooks/useCollectionSubmission.ts
 *
 * Verifies the discriminated-union state machine:
 *   idle → submitting → success (server)
 *   idle → submitting → success (offline)
 *   idle → submitting → error
 *   reset() returns state to idle
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { renderHook, act } from '@testing-library/react';

// Mock the orchestrator so no real Supabase calls happen
const mockOrchestrate = jest.fn<(...args: unknown[]) => Promise<unknown>>();
jest.mock('../services/collectionSubmissionOrchestrator', () => ({
  orchestrateCollectionSubmission: (args: unknown) => mockOrchestrate(args),
}));

import { useCollectionSubmission } from '../hooks/useCollectionSubmission';

import type { OrchestrateCollectionSubmissionInput } from '../services/collectionSubmissionOrchestrator';

function makeInput(): OrchestrateCollectionSubmissionInput {
  return {
    selectedLocation: { id: 'loc-1', name: 'Shop A' } as any,
    currentDriver: { id: 'drv-1', name: 'Alice' } as any,
    isOnline: true,
    currentScore: '200',
    photoData: null,
    aiReviewData: null,
    expenses: '0',
    expenseType: 'public',
    expenseCategory: undefined,
    coinExchange: '0',
    tip: '0',
    draftTxId: 'draft-1',
    isOwnerRetaining: false,
    ownerRetention: '0',
    calculations: {} as any,
    resolvedGps: { lat: -6.8, lng: 39.2 },
    gpsSourceType: 'none',
  };
}

function makeTransaction() {
  return {
    id: 'tx-1',
    locationId: 'loc-1',
    driverId: 'drv-1',
    timestamp: '2026-01-01T00:00:00Z',
    isSynced: true,
  } as any;
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ══ initial state ═════════════════════════════════════════════════════════════

describe('useCollectionSubmission — initial state', () => {
  it('starts in the idle state', () => {
    const { result } = renderHook(() => useCollectionSubmission());
    expect(result.current.state.status).toBe('idle');
  });

  it('exposes submit and reset callbacks', () => {
    const { result } = renderHook(() => useCollectionSubmission());
    expect(typeof result.current.submit).toBe('function');
    expect(typeof result.current.reset).toBe('function');
  });
});

// ══ successful server submission ══════════════════════════════════════════════

describe('useCollectionSubmission — server success', () => {
  it('transitions idle → submitting → success(server)', async () => {
    const tx = makeTransaction();
    mockOrchestrate.mockResolvedValue({ source: 'server', transaction: tx });

    const { result } = renderHook(() => useCollectionSubmission());

    let submitPromise!: Promise<void>;
    act(() => {
      submitPromise = result.current.submit(makeInput());
    });

    // After act() begins the async call, state is "submitting"
    expect(result.current.state.status).toBe('submitting');

    await act(async () => {
      await submitPromise;
    });

    expect(result.current.state.status).toBe('success');
    if (result.current.state.status === 'success') {
      expect(result.current.state.source).toBe('server');
      expect(result.current.state.transaction).toEqual(tx);
    }
  });
});

// ══ successful offline submission ═════════════════════════════════════════════

describe('useCollectionSubmission — offline success', () => {
  it('transitions to success with source=offline', async () => {
    const tx = makeTransaction();
    mockOrchestrate.mockResolvedValue({ source: 'offline', transaction: tx });

    const { result } = renderHook(() => useCollectionSubmission());

    await act(async () => {
      await result.current.submit(makeInput());
    });

    expect(result.current.state.status).toBe('success');
    if (result.current.state.status === 'success') {
      expect(result.current.state.source).toBe('offline');
    }
  });
});

// ══ error state ═══════════════════════════════════════════════════════════════

describe('useCollectionSubmission — error', () => {
  it('transitions to error when orchestrator throws an Error', async () => {
    mockOrchestrate.mockRejectedValue(new Error('Network timeout'));

    const { result } = renderHook(() => useCollectionSubmission());

    await act(async () => {
      await result.current.submit(makeInput());
    });

    expect(result.current.state.status).toBe('error');
    if (result.current.state.status === 'error') {
      expect(result.current.state.message).toBe('Network timeout');
    }
  });

  it('uses fallback message when a non-Error is thrown', async () => {
    mockOrchestrate.mockRejectedValue('unexpected string rejection');

    const { result } = renderHook(() => useCollectionSubmission());

    await act(async () => {
      await result.current.submit(makeInput());
    });

    expect(result.current.state.status).toBe('error');
    if (result.current.state.status === 'error') {
      expect(result.current.state.message).toBe('Submission failed');
    }
  });
});

// ══ reset ═════════════════════════════════════════════════════════════════════

describe('useCollectionSubmission — reset()', () => {
  it('returns state to idle from success', async () => {
    mockOrchestrate.mockResolvedValue({ source: 'server', transaction: makeTransaction() });

    const { result } = renderHook(() => useCollectionSubmission());
    await act(async () => { await result.current.submit(makeInput()); });
    expect(result.current.state.status).toBe('success');

    act(() => { result.current.reset(); });
    expect(result.current.state.status).toBe('idle');
  });

  it('returns state to idle from error', async () => {
    mockOrchestrate.mockRejectedValue(new Error('fail'));

    const { result } = renderHook(() => useCollectionSubmission());
    await act(async () => { await result.current.submit(makeInput()); });
    expect(result.current.state.status).toBe('error');

    act(() => { result.current.reset(); });
    expect(result.current.state.status).toBe('idle');
  });

  it('is a no-op when already idle', () => {
    const { result } = renderHook(() => useCollectionSubmission());
    expect(result.current.state.status).toBe('idle');
    act(() => { result.current.reset(); });
    expect(result.current.state.status).toBe('idle');
  });
});

// ══ orchestrator receives input ═══════════════════════════════════════════════

describe('useCollectionSubmission — orchestrator forwarding', () => {
  it('passes the input object through to orchestrateCollectionSubmission', async () => {
    mockOrchestrate.mockResolvedValue({ source: 'server', transaction: makeTransaction() });

    const { result } = renderHook(() => useCollectionSubmission());
    const input = makeInput();
    await act(async () => { await result.current.submit(input); });

    expect(mockOrchestrate).toHaveBeenCalledTimes(1);
    expect(mockOrchestrate).toHaveBeenCalledWith(input);
  });

  it('allows multiple sequential submissions', async () => {
    const tx = makeTransaction();
    mockOrchestrate.mockResolvedValue({ source: 'server', transaction: tx });

    const { result } = renderHook(() => useCollectionSubmission());

    await act(async () => { await result.current.submit(makeInput()); });
    act(() => { result.current.reset(); });
    await act(async () => { await result.current.submit(makeInput()); });

    expect(mockOrchestrate).toHaveBeenCalledTimes(2);
    expect(result.current.state.status).toBe('success');
  });
});
