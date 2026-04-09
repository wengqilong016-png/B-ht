/**
 * __tests__/useAuthPersistence.test.ts
 *
 * Tests for hooks/useAuthPersistence.ts
 * Covers localStorage-backed user caching helpers and lang defaulting.
 */
import { describe, it, expect, beforeEach } from '@jest/globals';

import {
  writeCachedUser,
  readCachedUser,
  clearCachedUser,
  defaultLangForRole,
} from '../hooks/useAuthPersistence';

import type { User } from '../types';

const CACHED_USER_KEY = 'bht-cached-user';

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-001',
    username: 'testuser',
    role: 'admin',
    name: 'Test Admin',
    mustChangePassword: false,
    ...overrides,
  } as unknown as User;
}

beforeEach(() => {
  localStorage.clear();
});

// ── writeCachedUser ────────────────────────────────────────────────────────────

describe('writeCachedUser()', () => {
  it('persists a User to localStorage', () => {
    const user = makeUser();
    writeCachedUser(user);
    const raw = localStorage.getItem(CACHED_USER_KEY);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    expect(parsed.id).toBe('user-001');
    expect(parsed.username).toBe('testuser');
  });

  it('does not throw when localStorage is unavailable', () => {
    const original = localStorage.setItem.bind(localStorage);
    jest.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => {
      throw new Error('Storage quota exceeded');
    });
    expect(() => writeCachedUser(makeUser())).not.toThrow();
    Storage.prototype.setItem = original;
  });
});

// ── readCachedUser ────────────────────────────────────────────────────────────

describe('readCachedUser()', () => {
  it('returns null when nothing is cached', () => {
    expect(readCachedUser()).toBeNull();
  });

  it('returns the cached User when present and valid', () => {
    const user = makeUser({ role: 'driver', name: 'Test Driver' });
    writeCachedUser(user);
    const result = readCachedUser();
    expect(result?.id).toBe('user-001');
    expect(result?.role).toBe('driver');
  });

  it('returns null and clears cache when cached data is invalid', () => {
    localStorage.setItem(CACHED_USER_KEY, JSON.stringify({ id: '', username: 'x', role: 'admin', name: 'X' }));
    const result = readCachedUser();
    expect(result).toBeNull();
    // Cache should have been cleared
    expect(localStorage.getItem(CACHED_USER_KEY)).toBeNull();
  });

  it('returns null when cached role is not admin or driver', () => {
    localStorage.setItem(CACHED_USER_KEY, JSON.stringify({ id: 'u1', username: 'x', role: 'superadmin', name: 'X' }));
    const result = readCachedUser();
    expect(result).toBeNull();
  });

  it('returns null when cached JSON is malformed', () => {
    localStorage.setItem(CACHED_USER_KEY, '{ invalid json {{');
    expect(readCachedUser()).toBeNull();
  });

  it('returns null when localStorage.getItem throws', () => {
    jest.spyOn(Storage.prototype, 'getItem').mockImplementationOnce(() => {
      throw new Error('Storage error');
    });
    expect(readCachedUser()).toBeNull();
  });
});

// ── clearCachedUser ───────────────────────────────────────────────────────────

describe('clearCachedUser()', () => {
  it('removes the cached user from localStorage', () => {
    writeCachedUser(makeUser());
    clearCachedUser();
    expect(localStorage.getItem(CACHED_USER_KEY)).toBeNull();
  });

  it('does not throw when nothing is cached', () => {
    expect(() => clearCachedUser()).not.toThrow();
  });
});

// ── defaultLangForRole ───────────────────────────────────────────────────────

describe('defaultLangForRole()', () => {
  it('returns zh for admin role', () => {
    expect(defaultLangForRole('admin')).toBe('zh');
  });

  it('returns sw for driver role', () => {
    expect(defaultLangForRole('driver')).toBe('sw');
  });
});
