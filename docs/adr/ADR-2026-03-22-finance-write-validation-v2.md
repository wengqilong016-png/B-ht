# ADR: Finance write validation v2

## Status
Proposed

## Context
Stage 1 introduced a clean preview path:
- one finance preview service
- one RPC for preview calculation
- one runtime caller in `DriverCollectionFlow`
- presentation-only `FinanceSummary`

However, the final transaction persistence path still trusts frontend-computed finance totals during submission. That means preview consistency improved, but **write-time authority** is still client-led.

## Problem
Current submission flow still allows the frontend to send persisted finance fields such as:
- `revenue`
- `commission`
- `ownerRetention`
- `netPayable`

This is not yet a server-authoritative write path.

## Decision
Stage 2 will move write-time finance normalization to a single server-side entrypoint.

### Stage 2 target shape
- frontend sends raw collection inputs
- server recomputes authoritative finance totals
- persisted transaction row uses server-computed values
- frontend no longer acts as the final authority for finance totals

## Proposed implementation boundary
Included:
- add one server-side write path (RPC or Edge Function)
- normalize finance fields on the server at submission time
- keep preview flow from stage 1 unchanged
- add contract-level validation notes/tests for the write path

Excluded:
- full offline queue redesign
- full idempotency protocol rollout
- settlement flow redesign
- approval workflow redesign

## Recommended implementation path
1. Introduce a dedicated write-time server entrypoint, e.g. `submit_collection_v2`.
2. Accept raw submission payload:
   - location id
   - driver id / auth context
   - current score
   - expenses
   - tip
   - coin exchange
   - owner retention inputs
   - proof metadata (photo / gps / ai hints)
3. Recompute finance totals on the server.
4. Persist normalized transaction values from the server.
5. Return the normalized transaction payload to the client.

## Frontend impact
- `SubmitReview.tsx` should eventually send raw inputs instead of trusted final finance totals.
- `createCollectionTransaction` may need to be split into:
  - raw submission payload builder
  - local fallback / offline payload builder

## Follow-up
Stage 3 should align offline queue payloads and idempotency semantics with the new server-authoritative submission contract.
