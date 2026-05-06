/**
 * Driver online presence — determined by lastActive heartbeat timestamp.
 *
 * The `drivers.status` field reflects account state (active/inactive/suspended),
 * NOT live online presence.  This utility computes the real presence from the
 * `lastActive` timestamp that the driver's GPS heartbeat updates every 60 s.
 *
 * ── Thresholds ──
 *  ONLINE → lastActive within the past 5 minutes
 *   AWAY  → lastActive within the past 30 minutes but > 5 minutes
 * OFFLINE → lastActive > 30 minutes ago or null
 */

export type DriverPresenceStatus = 'online' | 'away' | 'offline';

export interface DriverPresence {
  status: DriverPresenceStatus;
  /** Human-readable label key for use with translation function. */
  labelKey: 'driverOnline' | 'driverAway' | 'driverOffline';
}

const ONLINE_THRESHOLD_MS = 5 * 60 * 1000;   // 5 min
const AWAY_THRESHOLD_MS   = 30 * 60 * 1000;   // 30 min

/**
 * Compute the driver's online presence from their `lastActive` field.
 *
 * @param lastActive ISO-8601 timestamp or null.
 * @returns Presence record with status and i18n label key.
 */
export function getDriverPresence(lastActive?: string | null): DriverPresence {
  if (!lastActive) {
    return { status: 'offline', labelKey: 'driverOffline' };
  }

  const last = new Date(lastActive).getTime();
  if (!Number.isFinite(last)) {
    return { status: 'offline', labelKey: 'driverOffline' };
  }

  const elapsed = Date.now() - last;

  if (elapsed < 0) {
    // Clock skew — treat as offline to be safe
    return { status: 'offline', labelKey: 'driverOffline' };
  }

  if (elapsed <= ONLINE_THRESHOLD_MS) {
    return { status: 'online', labelKey: 'driverOnline' };
  }

  if (elapsed <= AWAY_THRESHOLD_MS) {
    return { status: 'away', labelKey: 'driverAway' };
  }

  return { status: 'offline', labelKey: 'driverOffline' };
}

/**
 * Convenience: is the driver considered online?
 */
export function isDriverOnline(lastActive?: string | null): boolean {
  return getDriverPresence(lastActive).status === 'online';
}
