import { Driver, Location, Transaction } from '../types';
import { safeRandomUUID } from '../types';

/**
 * Phase 5: Notification Event Stream
 * Detectors for generating system notifications based on business rules.
 */

export interface AppNotification {
  id: string;
  type: string; // 'machine_stale' | 'driver_abnormal' | 'anomaly_detected' | etc.
  title: string;
  message: string;
  level: 'info' | 'warning' | 'critical';
  entity_type?: 'driver' | 'location' | 'transaction';
  entity_id?: string;
  is_read: boolean;
  route_target?: string;
  created_at: string;
}

const MS_PER_DAY = 1000 * 60 * 60 * 24;

export const detectMachineEvents = (locations: Location[]): AppNotification[] => {
  const notifications: AppNotification[] = [];
  const now = Date.now();

  locations.forEach(loc => {
    // 1. Stale Risk
    if (loc.lastRevenueDate) {
      const daysIdle = Math.floor((now - new Date(loc.lastRevenueDate).getTime()) / MS_PER_DAY);
      if (daysIdle >= 7) {
        notifications.push({
          id: safeRandomUUID(),
          type: 'machine_stale',
          title: 'Stale Machine Alert',
          message: `${loc.name} has not generated revenue for ${daysIdle} days.`,
          level: daysIdle >= 14 ? 'critical' : 'warning',
          entity_type: 'location',
          entity_id: loc.id,
          is_read: false,
          route_target: `/admin/map?location=${loc.id}`,
          created_at: new Date().toISOString()
        });
      }
    }

    // 2. Overflow Risk
    if (loc.lastScore >= 9000) {
      notifications.push({
        id: safeRandomUUID(),
        type: 'machine_overflow_near',
        title: 'Machine Overflow Warning',
        message: `${loc.name} score is ${loc.lastScore}, approaching reset limit.`,
        level: 'warning',
        entity_type: 'location',
        entity_id: loc.id,
        is_read: false,
        route_target: `/admin/sites?location=${loc.id}`,
        created_at: new Date().toISOString()
      });
    }
  });

  return notifications;
};

export const detectTransactionEvents = (transactions: Transaction[]): AppNotification[] => {
  const notifications: AppNotification[] = [];
  const todayStart = new Date().toISOString().split('T')[0];

  const recentTxs = transactions.filter(t => t.timestamp.startsWith(todayStart));

  recentTxs.forEach(tx => {
    if (tx.isAnomaly) {
      notifications.push({
        id: safeRandomUUID(),
        type: 'anomaly_detected',
        title: 'Transaction Anomaly',
        message: `Anomalous transaction detected from ${tx.driverName || 'a driver'} at ${tx.locationName}.`,
        level: 'critical',
        entity_type: 'transaction',
        entity_id: tx.id,
        is_read: false,
        route_target: `/admin/approvals?tx=${tx.id}`,
        created_at: tx.timestamp
      });
    }

    if (tx.type === 'reset_request' && tx.approvalStatus === 'pending') {
      notifications.push({
        id: safeRandomUUID(),
        type: 'reset_request_created',
        title: 'Pending Reset Request',
        message: `Machine ${tx.locationName} requires a 9999 reset approval.`,
        level: 'critical',
        entity_type: 'transaction',
        entity_id: tx.id,
        is_read: false,
        route_target: `/admin/approvals?tx=${tx.id}`,
        created_at: tx.timestamp
      });
    }
  });

  return notifications;
};
