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

type Row = Record<string, unknown>;
type FilterPredicate = (row: Row) => boolean;

function isRow(value: unknown): value is Row {
  return typeof value === 'object' && value !== null;
}

function resolveFilteredValue(
  baseValue: { data: unknown; error: unknown },
  predicates: FilterPredicate[],
  resultLimit?: number,
): { data: unknown; error: unknown } {
  if (!Array.isArray(baseValue.data)) return baseValue;

  let data = baseValue.data.filter((row): row is Row => isRow(row));
  for (const predicate of predicates) {
    data = data.filter(predicate);
  }
  if (typeof resultLimit === 'number') {
    data = data.slice(0, resultLimit);
  }

  return { ...baseValue, data };
}

export function setChainResult(data: unknown, error: unknown = null): void {
  currentChainValue = { data, error };
}

export function makeChain(): ChainMock {
  const self: Record<string, unknown> = {};
  const predicates: FilterPredicate[] = [];
  let resultLimit: number | undefined;

  const chainValue = () => resolveFilteredValue(currentChainValue, predicates, resultLimit);
  const returnAwaitableSelf = () => Object.assign(Promise.resolve(chainValue()), self);

  const passthroughMethods = [
    'select', 'insert', 'update', 'delete', 'upsert',
    'order', 'abortSignal',
  ];

  for (const m of passthroughMethods) {
    self[m] = jest.fn().mockImplementation(() => {
      return returnAwaitableSelf();
    });
  }

  self.eq = jest.fn().mockImplementation((field: unknown, value: unknown) => {
    const key = String(field);
    predicates.push((row) => row[key] === value);
    return returnAwaitableSelf();
  });

  self.neq = jest.fn().mockImplementation((field: unknown, value: unknown) => {
    const key = String(field);
    predicates.push((row) => row[key] !== value);
    return returnAwaitableSelf();
  });

  self.in = jest.fn().mockImplementation((field: unknown, values: unknown) => {
    const key = String(field);
    const allowedValues = Array.isArray(values) ? values : [];
    predicates.push((row) => allowedValues.includes(row[key]));
    return returnAwaitableSelf();
  });

  self.is = jest.fn().mockImplementation((field: unknown, value: unknown) => {
    const key = String(field);
    predicates.push((row) => row[key] === value);
    return returnAwaitableSelf();
  });

  self.limit = jest.fn().mockImplementation((count: unknown) => {
    resultLimit = typeof count === 'number' ? count : undefined;
    return returnAwaitableSelf();
  });

  self.single = jest.fn().mockImplementation(() =>
    Promise.resolve({
      data: Array.isArray(chainValue().data) ? (chainValue().data as unknown[])[0] ?? null : chainValue().data,
      error: currentChainValue.error,
    }),
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
