# ADR: Stage 12A — submit flow boundary

## Status
Accepted

## Context
`driver/components/SubmitReview.tsx` had accumulated multiple responsibilities:

- derive raw submission input from UI fields
- decide online vs offline submission path
- call the server-authoritative submit RPC
- build a local fallback transaction when online submit fails
- enqueue the fallback transaction for later replay
- determine submission result semantics for the UI

That coupling made the submit path harder to test and increased the chance of UI-layer regressions when changing submission behavior.

## Decision
Introduce a dedicated orchestration service for the driver submit flow and reduce `SubmitReview` to UI-only responsibilities.

### New boundary

`services/collectionSubmissionOrchestrator.ts` now owns:
- raw input derivation (`buildCollectionSubmissionInput`)
- online submit attempt via `submitCollectionV2`
- offline fallback transaction creation
- queue enqueue attempt
- normalized result shape returned to the UI

`driver/components/SubmitReview.tsx` now owns:
- GPS acquisition / fallback prompts
- submit button state
- success / failure alerts
- handing the returned transaction to `onSubmit`

## Included
- new orchestration service for submit flow decisions
- focused tests for online success, online fallback, and offline path
- `SubmitReview` refactor to call the orchestration service

## Excluded
- no schema changes
- no support workflow changes
- no finance calculation redesign
- no realtime changes
- no shell refactor in this stage
