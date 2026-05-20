import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, render, renderHook } from '@testing-library/react';
import React from 'react';

// ─── Module mocks (before imports) ─────────────────────────────────────────

const mockFetchAdminNotifications = jest.fn<() => Promise<unknown>>();
const mockMarkAdminNotificationsRead = jest.fn<() => Promise<unknown>>();

jest.mock('../services/adminNotifications', () => ({
  fetchAdminNotifications: (...args: unknown[]) => mockFetchAdminNotifications(...args),
  markAdminNotificationsRead: (...args: unknown[]) => mockMarkAdminNotificationsRead(...args),
}));

const mockFetchDriverFlowEvents = jest.fn<() => Promise<unknown>>();

jest.mock('../services/driverFlowTelemetry', () => ({
  fetchDriverFlowEvents: (...args: unknown[]) => mockFetchDriverFlowEvents(...args),
}));

import { NotificationProvider, useNotifications } from '../contexts/NotificationContext';
import { CONSTANTS } from '../types';

import type { NotificationItem, NotificationEventType } from '../contexts/NotificationContext';
import type { User } from '../types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STORAGE_KEY = CONSTANTS.STORAGE_NOTIFICATIONS_KEY;

function makePayload(overrides: Partial<Omit<NotificationItem, 'id' | 'isRead' | 'createdAt'>> = {}) {
  return {
    type: 'info' as NotificationEventType,
    title: 'Test Notice',
    message: 'This is a test notification',
    level: 'info' as const,
    ...overrides,
  };
}

/** Render the hook inside NotificationProvider so useNotifications() works. */
function renderNotificationHook(currentUser?: User | null) {
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <NotificationProvider currentUser={currentUser}>{children}</NotificationProvider>
  );
  return renderHook(() => useNotifications(), { wrapper });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('NotificationContext', () => {
  beforeEach(() => {
    localStorage.clear();
    mockFetchAdminNotifications.mockReset();
    mockMarkAdminNotificationsRead.mockReset();
    mockFetchDriverFlowEvents.mockReset();
    // Default mocks: return empty so the admin fetch path completes silently
    mockFetchAdminNotifications.mockResolvedValue([]);
    mockFetchDriverFlowEvents.mockResolvedValue([]);
    mockMarkAdminNotificationsRead.mockResolvedValue(true);
  });

  // ── A) useNotifications without provider ────────────────────────────────

  it('returns default values when used outside NotificationProvider', () => {
    const { result } = renderHook(() => useNotifications());
    expect(result.current.notifications).toEqual([]);
    expect(result.current.unreadCount).toBe(0);
  });

  // ── B) addNotification ──────────────────────────────────────────────────

  it('addNotification prepends item, increments unreadCount, and persists to localStorage', () => {
    const { result } = renderNotificationHook();

    act(() => {
      result.current.addNotification(makePayload({ title: 'Hello' }));
    });

    const list = result.current.notifications;
    expect(list).toHaveLength(1);
    expect(list[0].title).toBe('Hello');
    expect(list[0].isRead).toBe(false);
    expect(list[0].id).toBeTruthy();
    expect(list[0].createdAt).toBeTruthy();
    expect(result.current.unreadCount).toBe(1);

    // Assert localStorage was written
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    expect(stored).toHaveLength(1);
    expect(stored[0].title).toBe('Hello');

    // Add a second — it should appear at index 0
    act(() => {
      result.current.addNotification(makePayload({ title: 'World' }));
    });

    expect(result.current.notifications).toHaveLength(2);
    expect(result.current.notifications[0].title).toBe('World');
    expect(result.current.notifications[1].title).toBe('Hello');
    expect(result.current.unreadCount).toBe(2);
  });

  // ── C) markAllRead ──────────────────────────────────────────────────────

  it('markAllRead sets isRead=true on all items and resets unreadCount', () => {
    const { result } = renderNotificationHook();

    // Add two notifications
    act(() => {
      result.current.addNotification(makePayload({ title: 'A' }));
      result.current.addNotification(makePayload({ title: 'B' }));
    });

    expect(result.current.unreadCount).toBe(2);

    act(() => {
      result.current.markAllRead();
    });

    expect(result.current.unreadCount).toBe(0);
    for (const n of result.current.notifications) {
      expect(n.isRead).toBe(true);
      expect(n.readAt).toBeTruthy();
    }
  });

  // ── D) clearAll ─────────────────────────────────────────────────────────

  it('clearAll empties the list, resets unreadCount, and clears localStorage', () => {
    const { result } = renderNotificationHook();

    act(() => {
      result.current.addNotification(makePayload());
      result.current.addNotification(makePayload());
    });

    expect(result.current.notifications.length).toBeGreaterThan(0);

    act(() => {
      result.current.clearAll();
    });

    expect(result.current.notifications).toEqual([]);
    expect(result.current.unreadCount).toBe(0);

    // localStorage should be cleared (empty array written)
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    expect(stored).toEqual([]);
  });

  // ── E) Admin mount triggers fetchAdminNotifications ─────────────────────

  it('calls fetchAdminNotifications on mount when currentUser role is admin', async () => {
    mockFetchAdminNotifications.mockResolvedValue([]);
    mockFetchDriverFlowEvents.mockResolvedValue([]);

    const adminUser: User = {
      id: 'admin-1',
      username: 'admin',
      role: 'admin',
      name: 'Admin',
    };

    // Render with admin user — the effect triggers fetchAdminNotifications
    render(
      <NotificationProvider currentUser={adminUser}>
        <div>child</div>
      </NotificationProvider>
    );

    // fetchAdminNotifications should have been called at least once
    expect(mockFetchAdminNotifications).toHaveBeenCalled();
  });
});
