/**
 * authMode.ts — centralises the VITE_DISABLE_AUTH env flag.
 *
 * Set VITE_DISABLE_AUTH=true to bypass Supabase Auth entirely.
 * Drivers identify themselves with a local driver_id stored in localStorage.
 * When VITE_DISABLE_AUTH is falsy (default), the normal Supabase Auth flow runs.
 *
 * Note: Vite env variables are always strings, so the value must be the
 * exact string "true" to enable disable-auth mode.
 */

import { User } from '../types';

export const LOCAL_DRIVER_ID_KEY = 'bht_local_driver_id';

/** True when the app is running in auth-disabled (local identity) mode. */
export const isAuthDisabled = (): boolean =>
  import.meta.env.VITE_DISABLE_AUTH === 'true';

/** Read the locally stored driver id, or null if not set/invalid. */
export const getLocalDriverId = (): string | null => {
  const stored = localStorage.getItem(LOCAL_DRIVER_ID_KEY);
  if (stored == null) return null;

  const normalized = stored.trim().toUpperCase();
  return normalized === '' ? null : normalized;
};

/** Persist a driver id locally (normalized: trimmed + uppercased). */
export const setLocalDriverId = (driverId: string): void => {
  const normalized = driverId.trim().toUpperCase();
  if (normalized === '') {
    localStorage.removeItem(LOCAL_DRIVER_ID_KEY);
    return;
  }
  localStorage.setItem(LOCAL_DRIVER_ID_KEY, normalized);
};

/** Clear the locally stored driver id (e.g. for driver switching). */
export const clearLocalDriverId = (): void =>
  localStorage.removeItem(LOCAL_DRIVER_ID_KEY);

/**
 * Build a local User object from a driver id.
 * The id is prefixed with "local:" to prevent collisions with real Supabase
 * auth user UUIDs.
 */
export const buildLocalUser = (driverId: string): User => ({
  id: `local:${driverId}`,
  username: driverId,
  name: driverId,
  role: 'driver',
  driverId,
});
