import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { QueryClient } from '@tanstack/react-query';
import { createRealtimeInvalidator } from '../hooks/realtimeInvalidation';

describe('createRealtimeInvalidator', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it('deduplicates repeated events for the same table into one invalidation', () => {
    const queryClient = new QueryClient();
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries').mockResolvedValue(undefined);
    const { queue } = createRealtimeInvalidator(queryClient, 250);

    queue('transactions');
    queue('transactions');
    queue('transactions');

    jest.advanceTimersByTime(250);

    expect(invalidateSpy).toHaveBeenCalledTimes(1);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['transactions'] });
  });

  it('invalidates each mapped table at most once per debounce window', () => {
    const queryClient = new QueryClient();
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries').mockResolvedValue(undefined);
    const { queue } = createRealtimeInvalidator(queryClient, 250);

    queue('transactions');
    queue('drivers');
    queue('daily_settlements');
    queue('drivers');

    jest.advanceTimersByTime(250);

    expect(invalidateSpy).toHaveBeenCalledTimes(3);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['transactions'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['drivers'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['dailySettlements'] });
  });

  it('cleanup cancels pending invalidations', () => {
    const queryClient = new QueryClient();
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries').mockResolvedValue(undefined);
    const { queue, cleanup } = createRealtimeInvalidator(queryClient, 250);

    queue('transactions');
    cleanup();

    jest.advanceTimersByTime(250);

    expect(invalidateSpy).not.toHaveBeenCalled();
  });
});
