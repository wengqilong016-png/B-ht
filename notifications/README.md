# Notifications System

## Overview

The `notifications` table stores system events that inform admin users about important changes requiring attention.

## Event Sources

| Event Type | Source | Description |
|---|---|---|
| `driver_online` | GPS heartbeat | Driver starts sending GPS updates |
| `driver_offline` | GPS heartbeat timeout | Driver stops sending GPS for > 10 min |
| `driver_idle` | Collection activity | Driver online but no collections for > 2 hours |
| `machine_stale` | Revenue date check | Machine has no revenue for > 7 days |
| `machine_high_risk` | Score threshold | Machine score approaching 9999 |
| `pending_approval` | Transaction submit | New reset/payout request awaiting admin action |
| `anomaly_detected` | AI audit | AI-detected score mismatch > 50 |

## Future Integration

- **Phase 2**: Notifications generated server-side (Supabase Edge Functions or triggers)
- **Termux**: Polling or Supabase Realtime subscription for push to admin devices
- **Frontend**: Notification bell icon in admin header; unread count badge
- Type definitions live in `shared/types/notifications.ts`
