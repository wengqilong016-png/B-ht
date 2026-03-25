# ADR: Stage 14 — renderer type tightening

## Status
Accepted

## Context
Stage 12C extracted admin/driver shell view renderers into dedicated modules, but the initial extraction favored speed over type precision. Both renderer modules used broad `any` props for context-derived data and mutation handles.

That kept behavior stable, but it weakened type safety in the exact files that now centralize page wiring.

## Decision
Tighten renderer prop types using existing domain and context-adjacent types:
- `User`, `Location`, `Driver`, `Transaction`, `DailySettlement`, `AILog`
- `UseMutationResult` from React Query
- `SyncMutationHandle` from `useSyncStatus`

## Included
- replace broad `any` renderer props with explicit domain and mutation types
- preserve Stage 12C renderer structure and behavior
- add focused tests asserting renderer files no longer use broad `any` props

## Excluded
- no shell behavior changes
- no schema changes
- no support workflow changes
- no realtime changes
- no business-rule changes
