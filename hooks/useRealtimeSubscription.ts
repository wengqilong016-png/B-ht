/**
 * useRealtimeSubscription.ts
 * ──────────────────────────────────────────────────────────────────────────────
 * Supabase Realtime hook that subscribes to INSERT/UPDATE changes on
 * `transactions`, `drivers`, and `daily_settlements` tables, invalidating the
 * corresponding React Query caches so the UI refreshes immediately.
 *
 * The existing polling inside useSupabaseData is kept as a fallback for
 * weak/offline network conditions; this hook is an enhancement on top.
 */

import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../supabaseClient';
import { createRealtimeInvalidator } from './realtimeInvalidation';

export type RealtimeStatus = 'connected' | 'disconnected' | 'reconnecting';

export function useRealtimeSubscription() {
  const queryClient = useQueryClient();
  const [realtimeStatus, setRealtimeStatus] = useState<RealtimeStatus>('disconnected');

  useEffect(() => {
    if (!supabase) return;

    const { queue, cleanup } = createRealtimeInvalidator(queryClient);

    const channel = supabase
      .channel('app-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'transactions' },
        () => queue('transactions')
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'drivers' },
        () => queue('drivers')
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'daily_settlements' },
        () => queue('daily_settlements')
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setRealtimeStatus('connected');
        } else if (status === 'CLOSED') {
          setRealtimeStatus('disconnected');
        } else {
          setRealtimeStatus('reconnecting');
        }
      });

    return () => {
      cleanup();
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return { realtimeStatus };
}
