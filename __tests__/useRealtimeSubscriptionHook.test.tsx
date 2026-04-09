import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

type BroadcastHandler = () => void;
type StatusHandler = (status: string) => void;

type MockRealtimeChannel = {
  topic: string;
  on: (_type: string, filter: { event: string }, callback: BroadcastHandler) => MockRealtimeChannel;
  subscribe: (callback: StatusHandler) => MockRealtimeChannel;
  emitBroadcast: (event: string) => void;
  emitStatus: (status: string) => void;
};

const mockSetAuth = jest.fn();
const mockGetSession = jest.fn<() => Promise<unknown>>();
const mockRemoveChannel = jest.fn();
const channelRegistry = new Map<string, MockRealtimeChannel>();

function makeRealtimeChannel(topic: string): MockRealtimeChannel {
  const broadcastHandlers = new Map<string, BroadcastHandler[]>();
  let statusHandler: StatusHandler | null = null;

  const channel: MockRealtimeChannel = {
    topic,
    on: jest.fn((_type: string, filter: { event: string }, callback: BroadcastHandler) => {
      const handlers = broadcastHandlers.get(filter.event) ?? [];
      handlers.push(callback);
      broadcastHandlers.set(filter.event, handlers);
      return channel;
    }) as MockRealtimeChannel['on'],
    subscribe: jest.fn((callback: StatusHandler) => {
      statusHandler = callback;
      return channel;
    }) as MockRealtimeChannel['subscribe'],
    emitBroadcast: (event: string) => {
      for (const handler of broadcastHandlers.get(event) ?? []) handler();
    },
    emitStatus: (status: string) => {
      statusHandler?.(status);
    },
  };

  return channel;
}

jest.mock('../supabaseClient', () => ({
  supabase: {
    realtime: {
      setAuth: () => mockSetAuth(),
    },
    auth: {
      getSession: () => mockGetSession(),
    },
    channel: (topic: string) => {
      const channel = makeRealtimeChannel(topic);
      channelRegistry.set(topic, channel);
      return channel;
    },
    removeChannel: (channel: MockRealtimeChannel) => mockRemoveChannel(channel),
  },
}));

import { useRealtimeSubscription } from '../hooks/useRealtimeSubscription';
import { REALTIME_INVALIDATE_DEBOUNCE_MS } from '../services/realtimeInvalidation';

describe('useRealtimeSubscription', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    channelRegistry.clear();
    mockGetSession.mockResolvedValue({ data: { session: null }, error: null });
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  function makeWrapper(queryClient: QueryClient) {
    return function Wrapper({ children }: { children: React.ReactNode }) {
      return (
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      );
    };
  }

  it('subscribes admin users to all realtime channels and marks connected only after all channels subscribe', () => {
    const queryClient = new QueryClient();
    const wrapper = makeWrapper(queryClient);
    const { result } = renderHook(() => useRealtimeSubscription('admin', true), { wrapper });

    return waitFor(() => expect(mockSetAuth).toHaveBeenCalledTimes(2)).then(() => {
    expect(Array.from(channelRegistry.keys())).toEqual([
      'db:transactions',
      'db:drivers',
      'db:daily_settlements',
      'db:locations',
    ]);
    expect(result.current.realtimeStatus).toBe('disconnected');

    act(() => {
      channelRegistry.get('db:transactions')?.emitStatus('SUBSCRIBED');
      channelRegistry.get('db:drivers')?.emitStatus('SUBSCRIBED');
      channelRegistry.get('db:daily_settlements')?.emitStatus('SUBSCRIBED');
    });
    expect(result.current.realtimeStatus).toBe('disconnected');

    act(() => {
      channelRegistry.get('db:locations')?.emitStatus('SUBSCRIBED');
    });
    expect(result.current.realtimeStatus).toBe('connected');
    });
  });

  it('subscribes driver users only to transaction updates', () => {
    const queryClient = new QueryClient();
    const wrapper = makeWrapper(queryClient);

    renderHook(() => useRealtimeSubscription('driver', true), { wrapper });

    expect(Array.from(channelRegistry.keys())).toEqual(['db:transactions']);
  });

  it('coalesces bursty broadcast events into one invalidation per query key to avoid UI jitter', () => {
    const queryClient = new QueryClient();
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries').mockResolvedValue(undefined);
    const wrapper = makeWrapper(queryClient);

    renderHook(() => useRealtimeSubscription('admin', true), { wrapper });

    act(() => {
      channelRegistry.get('db:transactions')?.emitBroadcast('INSERT');
      channelRegistry.get('db:transactions')?.emitBroadcast('UPDATE');
      channelRegistry.get('db:transactions')?.emitBroadcast('DELETE');
      channelRegistry.get('db:drivers')?.emitBroadcast('UPDATE');
      jest.advanceTimersByTime(REALTIME_INVALIDATE_DEBOUNCE_MS);
    });

    expect(invalidateSpy).toHaveBeenCalledTimes(2);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['transactions'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['drivers'] });
  });

  it('transitions to reconnecting/connected/disconnected as channel status changes', () => {
    const queryClient = new QueryClient();
    const wrapper = makeWrapper(queryClient);
    const { result } = renderHook(() => useRealtimeSubscription('driver', true), { wrapper });

    act(() => {
      channelRegistry.get('db:transactions')?.emitStatus('CHANNEL_ERROR');
    });
    expect(result.current.realtimeStatus).toBe('reconnecting');

    act(() => {
      channelRegistry.get('db:transactions')?.emitStatus('SUBSCRIBED');
    });
    expect(result.current.realtimeStatus).toBe('connected');

    act(() => {
      channelRegistry.get('db:transactions')?.emitStatus('CLOSED');
    });
    expect(result.current.realtimeStatus).toBe('disconnected');
  });

  it('removes subscribed channels on unmount', () => {
    const queryClient = new QueryClient();
    const wrapper = makeWrapper(queryClient);
    const { unmount } = renderHook(() => useRealtimeSubscription('admin', true), { wrapper });

    const createdChannels = Array.from(channelRegistry.values());
    unmount();

    expect(mockRemoveChannel).toHaveBeenCalledTimes(createdChannels.length);
    createdChannels.forEach((channel) => {
      expect(mockRemoveChannel).toHaveBeenCalledWith(channel);
    });
  });
});
