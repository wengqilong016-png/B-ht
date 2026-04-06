/**
 * Shared Supabase mock helpers for repository and hook tests.
 *
 * Creates a chainable query builder mock that mirrors the Supabase JS client
 * fluent API:  supabase.from('table').select().eq().order()...
 */

import { jest } from '@jest/globals';

export interface ChainMock {
  select: jest.Mock;
  insert: jest.Mock;
  update: jest.Mock;
  delete: jest.Mock;
  upsert: jest.Mock;
  eq: jest.Mock;
  neq: jest.Mock;
  in: jest.Mock;
  is: jest.Mock;
  order: jest.Mock;
  limit: jest.Mock;
  single: jest.Mock;
  maybeSingle: jest.Mock;
  abortSignal: jest.Mock;
  then: undefined;
}

/** The resolved value that terminates the chain. */
let currentChainValue: { data: unknown; error: unknown } = { data: [], error: null };

export function setChainResult(data: unknown, error: unknown = null): void {
  currentChainValue = { data, error };
}

export function makeChain(): ChainMock {
  const self: Record<string, unknown> = {};
  const methods = [
    'select', 'insert', 'update', 'delete', 'upsert',
    'eq', 'neq', 'in', 'is',
    'order', 'limit', 'abortSignal',
  ];

  for (const m of methods) {
    self[m] = jest.fn().mockImplementation(() => {
      // Return a proxy that resolves chainValue on await
      return Object.assign(Promise.resolve(currentChainValue), self);
    });
  }

  self.single = jest.fn().mockImplementation(() =>
    Promise.resolve({ data: Array.isArray(currentChainValue.data) ? (currentChainValue.data as unknown[])[0] ?? null : currentChainValue.data, error: currentChainValue.error }),
  );
  self.maybeSingle = self.single;

  // Prevent promise-like detection on the chain object itself
  self.then = undefined;

  return self as unknown as ChainMock;
}

export function makeSupabaseMock(chain: ChainMock) {
  return {
    from: jest.fn(() => chain),
    rpc: jest.fn(() => Promise.resolve({ data: null, error: null })),
    auth: {
      getSession: jest.fn(() => Promise.resolve({ data: { session: null }, error: null })),
      getUser: jest.fn(() => Promise.resolve({ data: { user: null }, error: null })),
      signInWithPassword: jest.fn(),
      signOut: jest.fn(),
      onAuthStateChange: jest.fn(() => ({ data: { subscription: { unsubscribe: jest.fn() } } })),
    },
    channel: jest.fn(() => ({
      on: jest.fn().mockReturnThis(),
      subscribe: jest.fn(),
      unsubscribe: jest.fn(),
    })),
    removeChannel: jest.fn(),
  };
}
