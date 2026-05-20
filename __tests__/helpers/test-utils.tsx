/**
 * Shared render wrapper that composes the full provider tree used by
 * component and hook tests.  Every component test that needs Auth, Data,
 * or React Query can use renderWithProviders() instead of building its
 * own provider stack from scratch.
 *
 * Usage
 *   const { user } = renderWithProviders(<MyComponent />, {
 *     auth: { userRole: 'driver', activeDriverId: 'drv-1' },
 *     data: { filteredLocations: [loc] },
 *   });
 *   await user.click(screen.getByRole('button', { name: /submit/i }));
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { jest } from '@jest/globals';

import { AuthProvider } from '../../contexts/AuthContext';
import type { AuthContextValue } from '../../contexts/AuthContext';
import { DataProvider } from '../../contexts/DataContext';
import type { DataContextValue } from '../../contexts/DataContext';
import { ToastProvider } from '../../contexts/ToastContext';

// ─── Default values ──────────────────────────────────────────────────────

export function makeDefaultAuthValue(
  overrides: Partial<AuthContextValue> = {},
): AuthContextValue {
  return {
    currentUser: {
      id: 'u1',
      username: 'testuser',
      role: 'admin',
      name: 'Test User',
    },
    userRole: 'admin',
    lang: 'sw' as const,
    setLang: jest.fn(),
    handleLogout: jest.fn(),
    activeDriverId: undefined,
    ...overrides,
  };
}

export function makeDefaultDataValue(
  overrides: Partial<DataContextValue> = {},
): DataContextValue {
  return {
    isOnline: true,
    isLoadingLocations: false,
    locations: [],
    drivers: [],
    transactions: [],
    dailySettlements: [],
    aiLogs: [],
    filteredLocations: [],
    filteredDrivers: [],
    filteredTransactions: [],
    filteredSettlements: [],
    unsyncedCount: 0,
    ...overrides,
  };
}

// ─── Render options ──────────────────────────────────────────────────────

export interface RenderOptions {
  auth?: Partial<AuthContextValue>;
  data?: Partial<DataContextValue>;
  queryClient?: QueryClient;
  /** Skip QueryClientProvider wrapping (default: true) */
  withQueryClient?: boolean;
  /** Skip AuthProvider wrapping (default: true) */
  withAuth?: boolean;
  /** Skip DataProvider wrapping (default: true) */
  withData?: boolean;
  /** Skip ToastProvider wrapping (default: true) */
  withToast?: boolean;
}

// ─── Main render wrapper ─────────────────────────────────────────────────

export function renderWithProviders(
  ui: React.ReactElement,
  options: RenderOptions = {},
) {
  const {
    auth,
    data,
    queryClient,
    withQueryClient = true,
    withAuth = true,
    withData = true,
    withToast = true,
  } = options;

  const qc =
    queryClient ??
    new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

  const authValue = makeDefaultAuthValue(auth);
  const dataValue = makeDefaultDataValue(data);

  function wrap(children: React.ReactNode): React.ReactElement {
    let el = children as React.ReactElement;

    if (withToast) {
      el = React.createElement(ToastProvider, null, el);
    }

    if (withData) {
      el = React.createElement(DataProvider, { value: dataValue, children: el });
    }

    if (withAuth) {
      el = React.createElement(AuthProvider, { value: authValue, children: el });
    }

    if (withQueryClient) {
      el = React.createElement(QueryClientProvider, { client: qc }, el);
    }

    return el as React.ReactElement;
  }

  const result = render(wrap(ui));

  return {
    ...result,
    queryClient: qc,
    authValue,
    dataValue,
    /** Pre-configured user-event instance for realistic interaction. */
    user: userEvent.setup(),
  };
}

export { act, fireEvent, renderHook, screen, userEvent, waitFor };
