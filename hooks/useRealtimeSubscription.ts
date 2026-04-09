/**
 * useRealtimeSubscription.ts
 * ──────────────────────────────────────────────────────────────────────────────
 * Supabase Realtime hook that subscribes to INSERT/UPDATE/DELETE changes on
 * `transactions`, `drivers`, and `daily_settlements` tables via broadcast
 * channels backed by database triggers, invalidating the corresponding
 * React Query caches so the UI refreshes immediately.
 *
 * Uses dedicated private channels (`db:transactions`, `db:drivers`,
 * `db:daily_settlements`, `db:locations`) instead of `postgres_changes` for
 * better scalability.
 * Database triggers call `realtime.broadcast_changes()` to publish events.
 *
 * The existing polling inside useSupabaseData is kept as a fallback for
 * weak/offline network conditions; this hook is an enhancement on top.
 *
 * Pass `userRole` to restrict subscriptions by role: drivers only need the
 * `db:transactions` channel (their own collection changes), while admins
 * subscribe to all four channels.
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
  { topic: 'db:locations',         table: 'locations'         },
] as const;

/** Reduced channel set for driver accounts — only their own transaction changes. */
const DRIVER_CHANNELS = [
  { topic: 'db:transactions',      table: 'transactions'      },
] as const;

type RealtimeChannelConfig = (typeof ADMIN_CHANNELS | typeof DRIVER_CHANNELS)[number];
type RealtimeTableName = RealtimeChannelConfig['table'];

function getChannelConfigs(userRole: 'admin' | 'driver') {
  return userRole === 'driver' ? DRIVER_CHANNELS : ADMIN_CHANNELS;
}

function createStatusHandler(
  subscribedTopics: Set<string>,
  expectedChannelCount: number,
  setRealtimeStatus: React.Dispatch<React.SetStateAction<RealtimeStatus>>,
) {
  return (topic: string) => (status: string) => {
    if (status === 'SUBSCRIBED') {
      subscribedTopics.add(topic);
      if (subscribedTopics.size === expectedChannelCount) {
        setRealtimeStatus('connected');
      }
      return;
    }

    if (status === 'CLOSED') {
      subscribedTopics.delete(topic);
      if (subscribedTopics.size === 0) {
        setRealtimeStatus('disconnected');
      }
      return;
    }

    setRealtimeStatus('reconnecting');
  };
}

function subscribeToRealtimeChannels(
  client: NonNullable<typeof supabase>,
  channelConfigs: typeof ADMIN_CHANNELS | typeof DRIVER_CHANNELS,
  queue: (table: RealtimeTableName) => void,
  setRealtimeStatus: React.Dispatch<React.SetStateAction<RealtimeStatus>>,
) {
  const subscribedTopics = new Set<string>();
  const statusHandlerFactory = createStatusHandler(
    subscribedTopics,
    channelConfigs.length,
    setRealtimeStatus,
  );

  return channelConfigs.map(({ topic, table }) => {
    const channel = client.channel(topic, { config: { private: true } });

    for (const event of BROADCAST_EVENTS) {
      channel.on('broadcast', { event }, () => queue(table));
    }

    channel.subscribe(statusHandlerFactory(topic));
    return channel;
  });
}

export function useRealtimeSubscription(userRole?: 'admin' | 'driver', isOnline?: boolean) {
  const queryClient = useQueryClient();
  const [realtimeStatus, setRealtimeStatus] = useState<RealtimeStatus>('disconnected');

  // Main subscription setup — depends on userRole to pick channels.
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
    const client = supabase;
    client.realtime.setAuth();

    const channelConfigs = getChannelConfigs(userRole);
    const channels = subscribeToRealtimeChannels(client, channelConfigs, queue, setRealtimeStatus);

    return () => {
      cleanup();
      channels.forEach((ch) => client.removeChannel(ch));
    };
  }, [queryClient, userRole]);

  // Re-authenticate realtime when connectivity is restored.  The JWT may have
  // expired during the offline period; refreshing the auth session first ensures
  // the SDK's built-in reconnect uses a valid token instead of silently failing.
  useEffect(() => {
    if (!supabase || !userRole || !isOnline) return;
    const client = supabase;
    client.auth.getSession().then(() => {
      client.realtime.setAuth();
    }).catch((error) => {
      console.warn('Failed to refresh realtime auth session.', error);
    });
  }, [isOnline, userRole]);

  return { realtimeStatus };
}
