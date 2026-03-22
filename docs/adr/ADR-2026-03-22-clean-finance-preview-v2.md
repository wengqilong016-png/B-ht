# ADR: Clean finance preview v2

## Status
Proposed

## Context
PR #95 tried to move finance calculation preview to a Supabase RPC, but it mixed runtime files with unused `src/driver/...` paths, duplicated migrations, and did not create a clean single-entry flow.

The current runtime flow is:
1. `driver/pages/DriverCollectionFlow.tsx` computes preview values locally.
2. `driver/components/FinanceSummary.tsx` displays those values.
3. `driver/components/SubmitReview.tsx` uses the same values to build the transaction payload.

For a safe first step, we should **only** improve the preview calculation path and keep final submission unchanged.

## Decision
Introduce a clean first-stage implementation with:
- one migration: `calculate_finance_v2`
- one frontend service: `services/financeCalculator.ts`
- one runtime caller: `DriverCollectionFlow`
- `FinanceSummary` as a pure presentation component

## Scope of stage 1
Included:
- local calculator extracted to service
- optional RPC-backed preview calculation
- local fallback preserved when offline / RPC unavailable
- explicit source tagging (`server` vs `local`)

Excluded:
- changing final transaction submission
- changing offline queue semantics
- changing settlement or admin approval logic
- introducing Edge Functions or RPC writes

## Why this shape
This keeps the first PR small, reviewable, and low-risk. It also avoids pretending that preview RPC already equals server-authoritative persistence.

## Follow-up
Stage 2 should move final transaction validation / write-time finance normalization to a server-side path (RPC or Edge Function), so the backend becomes the actual source of truth for saved finance totals.
