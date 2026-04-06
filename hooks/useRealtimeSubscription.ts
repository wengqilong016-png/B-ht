/**
 * useRealtimeSubscription.ts
 * ──────────────────────────────────────────────────────────────────────────────
 * Supabase Realtime hook that subscribes to INSERT/UPDATE/DELETE changes on
 * `transactions`, `drivers`, and `daily_settlements` tables via broadcast
 * channels backed by database triggers, invalidating the corresponding React
 * Query caches so the UI refreshes immediately.
 *
 * Uses dedicated private channels (`db:transactions`, `db:drivers`,
 * `db:daily_settlements`) instead of `postgres_changes` for better scalability.
 * Database triggers call `realtime.broadcast_changes()` to publish events.
 *
 * The existing polling inside useSupabaseData is kept as a fallback for
 * weak/offline network conditions; this hook is an enhancement on top.
 *
 * Pass `userRole` to restrict subscriptions by role: drivers only need the
 * `db:transactions` channel (their own collection changes), while admins
 * subscribe to all three channels.
 */

import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../supabaseClient';
import { createRealtimeInvalidator } from '../services/realtimeInvalidation';

export type RealtimeStatus = 'connected' | 'disconnected' | 'reconnecting';

/** Broadcast event names matching TG_OP values emitted by notify_table_changes(). */
const BROADCAST_EVENTS = ['INSERT', 'UPDATE', 'DELETE'] as const;

/** All channels — used by admin accounts. */
const ADMIN_CHANNELS = [
  { topic: 'db:transactions',      table: 'transactions'      },
  { topic: 'db:drivers',           table: 'drivers'           },
  { topic: 'db:daily_settlements', table: 'daily_settlements' },
] as const;

/** Reduced channel set for driver accounts — only their own transaction changes. */
const DRIVER_CHANNELS = [
  { topic: 'db:transactions',      table: 'transactions'      },
] as const;

export function useRealtimeSubscription(userRole?: 'admin' | 'driver') {
  const queryClient = useQueryClient();
  const [realtimeStatus, setRealtimeStatus] = useState<RealtimeStatus>('disconnected');

  useEffect(() => {
    if (!supabase) return;
    // Do not subscribe until the user's role is known.  Subscribing before the
    // role is resolved would default to ADMIN_CHANNELS and expose admin-scoped
    // broadcast events to an unauthenticated or driver-role session.
    if (!userRole) return;

    const { queue, cleanup } = createRealtimeInvalidator(queryClient);

    // Set auth token so private channels pass RLS checks on realtime.messages.
    // Passing no argument automatically uses the current session token from the
    // Supabase client.
    supabase.realtime.setAuth();

    const channelConfigs = userRole === 'driver' ? DRIVER_CHANNELS : ADMIN_CHANNELS;

    // Track which channel topics have reached SUBSCRIBED state so the aggregate
    // status indicator is accurate even when channels transition independently.
    const subscribedTopics = new Set<string>();

    const makeStatusHandler = (topic: string) => (status: string) => {
      if (status === 'SUBSCRIBED') {
        subscribedTopics.add(topic);
        if (subscribedTopics.size === channelConfigs.length) {
          setRealtimeStatus('connected');
        }
      } else if (status === 'CLOSED') {
        subscribedTopics.delete(topic);
        if (subscribedTopics.size === 0) {
          setRealtimeStatus('disconnected');
        }
      } else {
        setRealtimeStatus('reconnecting');
      }
    };

    const channels = channelConfigs.map(({ topic, table }) => {
      const ch = supabase.channel(topic, { config: { private: true } });

      for (const event of BROADCAST_EVENTS) {
        ch.on('broadcast', { event }, () => queue(table));
      }

      ch.subscribe(makeStatusHandler(topic));
      return ch;
    });

    return () => {
      cleanup();
      channels.forEach((ch) => supabase.removeChannel(ch));
    };
  }, [queryClient, userRole]);

  return { realtimeStatus };
}
