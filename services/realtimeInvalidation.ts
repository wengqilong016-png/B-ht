import { QueryClient } from '@tanstack/react-query';

export type RealtimeTable = 'transactions' | 'drivers' | 'daily_settlements';

export const REALTIME_INVALIDATE_DEBOUNCE_MS = 250;

const TABLE_TO_QUERY_KEY: Record<RealtimeTable, readonly [string]> = {
  transactions: ['transactions'],
  drivers: ['drivers'],
  daily_settlements: ['dailySettlements'],
};

/**
 * Consolidates rapid realtime events into one invalidation per query key.
 * This prevents duplicate network requests and UI jitter during event bursts.
 */
export function createRealtimeInvalidator(queryClient: QueryClient, debounceMs = REALTIME_INVALIDATE_DEBOUNCE_MS) {
  const pendingKeys = new Set<string>();
  let flushTimer: ReturnType<typeof setTimeout> | null = null;

  const flush = () => {
    flushTimer = null;
    const keys = Array.from(pendingKeys);
    pendingKeys.clear();
    keys.forEach((key) => {
      queryClient.invalidateQueries({ queryKey: [key] });
    });
  };

  const queue = (table: RealtimeTable) => {
    pendingKeys.add(TABLE_TO_QUERY_KEY[table][0]);
    if (flushTimer) return;
    flushTimer = setTimeout(flush, debounceMs);
  };

  const cleanup = () => {
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    pendingKeys.clear();
  };

  return { queue, cleanup };
}
