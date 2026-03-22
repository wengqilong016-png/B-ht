# ADR: Offline idempotency hardening v3

## Status
Proposed

## Context
Stage 1 centralized finance preview.
Stage 2 moved collection persistence toward a server-authoritative write path.

The remaining risk area is the offline/retry path:
- local queue replay may diverge from the new server-side submission contract
- duplicate or retried submissions may not have a fully unified idempotency story
- failure visibility and retry semantics are still closer to best-effort than auditable delivery

## Problem
The system now has a stronger online write path, but offline submission and replay need to align with it.

Main risks:
1. queued local payloads may not match the raw-input contract expected by the server
2. replayed submissions may not clearly return the already-persisted authoritative row
3. failures may be retried without clear categorization or operator visibility
4. client-side fallback and server-side write semantics may drift over time

## Decision
Stage 3 will harden offline submission around the server-authoritative contract introduced in stage 2.

## Stage 3 target shape
- queue raw submission payloads, not trusted finance totals
- use idempotency-safe identifiers consistently across online and replay paths
- ensure replay returns the persisted authoritative row when a duplicate submission is retried
- improve retry/failure visibility without redesigning the whole app architecture

## Included in this stage
- align offline queue payload shape to the stage-2 submission contract
- add explicit idempotency/replay handling notes in the submission path
- improve failure classification / retry semantics for collection submission replay
- add tests around duplicate submission and offline replay behavior

## Excluded from this stage
- full queue storage engine replacement
- settlement workflow redesign
- admin approval redesign
- broad feature-first architecture cleanup

## Recommended implementation path
1. Introduce a submission payload model that both online submit and offline replay share.
2. Route replay through the same server-authoritative submission entrypoint when connectivity returns.
3. Ensure duplicate `txId` replay returns the persisted row and is treated as success, not as a new divergent write.
4. Record enough retry metadata to distinguish transient failures from hard failures.
5. Add focused tests for replay, duplicate tx ids, and fallback transitions.

## Follow-up
After stage 3, the next improvements should be operational rather than structural:
- dead-letter visibility
- admin-facing replay diagnostics
- broader queue observability
