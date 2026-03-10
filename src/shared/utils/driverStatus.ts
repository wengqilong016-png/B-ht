import { Driver, Transaction } from '../../types';

/**
 * shared/utils/driverStatus.ts
 * Driver state machine logic based on DOCS_DATABASE_SCHEMA.md.
 */

export type DriverStatus = 'active' | 'online' | 'idle' | 'offline' | 'abnormal';

export function getDriverStatus(driver: Driver, recentTransactions: Transaction[]): DriverStatus {
  // 1. Check for anomalies first (Highest Priority)
  const hasAnomaly = recentTransactions.some(
    tx => tx.driverId === driver.id && tx.isAnomaly
  );
  if (hasAnomaly) {
    return 'abnormal';
  }

  // 2. Check last active time
  if (!driver.lastActive) {
    return 'offline';
  }

  const lastActiveTime = new Date(driver.lastActive).getTime();
  const now = Date.now();
  const diffMinutes = (now - lastActiveTime) / (1000 * 60);

  // 3. State Machine logic
  if (diffMinutes <= 10) {
    return 'active'; // Heartbeat or action within 10 mins
  } else if (diffMinutes <= 30) {
    return 'online'; // Session active but no recent action
  } else if (diffMinutes <= 45) {
    return 'offline'; // Considered disconnected/dropped
  } else {
    return 'idle'; // Long-term inactive
  }
}
