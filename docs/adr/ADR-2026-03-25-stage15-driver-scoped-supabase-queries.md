# ADR: Stage 15 — driver-scoped Supabase queries

## Status
Accepted

## Context
The app already differentiates admin vs driver data volume in `useSupabaseData`, but the heavy queries still used broad fetches followed by client-side filtering in `App.tsx`.

That means driver sessions could still:
- download more transactions than they need
- download more daily settlements than they need
- spend more time and memory filtering data on the client

This is especially costly on lower-end mobile devices and weak networks.

## Decision
Introduce small query-scope helpers and use them to scope driver-heavy Supabase queries by `driverId`.

### Included
- add `hooks/supabaseRoleScope.ts`
- scope driver `transactions` query by `driverId`
- scope driver `daily_settlements` query by `driverId`
- use role-aware cache/storage keys for those scoped datasets
- pass `activeDriverId` into `useSupabaseData`
- add focused tests for query-scope helper logic

## Excluded
- no schema changes
- no support workflow changes
- no realtime changes
- no renderer changes
- no business-rule changes

## Result
Driver sessions fetch less heavy data from Supabase and do less client-side work, while admin behavior remains unchanged.
