# Driver Status — Generated Reference

<!-- TODO: Auto-generate this file from driver status enums in types.ts -->

This document describes the possible driver status values used throughout the Bahati Jackpots system.

## Status Values

| Status | Description |
|--------|-------------|
| `active` | Driver is logged in and on route |
| `inactive` | Driver account exists but is not currently on route |
| `pending` | Driver registration is awaiting admin approval |

## Notes

- Driver real-time GPS heartbeat is updated every 20 seconds via `useOfflineSyncLoop.ts`.
- Admin can view live driver positions on the LiveMap component.
- Status transitions are managed in `hooks/useSupabaseMutations.ts`.

<!-- TODO: Expand with full state machine diagram once stabilized -->
