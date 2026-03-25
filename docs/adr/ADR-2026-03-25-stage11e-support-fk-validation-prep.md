# ADR: Stage 11E — support FK validation prep

## Status
Proposed

## Context
Stage 11D added `support_audit_log_case_id_fkey` as `NOT VALID`, after Stage 11A soft hardening and Stage 11B/11C data cleanup established a clean baseline.

Before running `VALIDATE CONSTRAINT`, the project needs a narrowly scoped preparation step that documents the final go/no-go checks, operator verification workflow, and rollback guidance.

## Decision
Open a narrowly scoped Stage 11E preparation stage focused on validation readiness only. The detailed operator runbook lives in `docs/RUNBOOK.stage11e.md`; the main `docs/RUNBOOK.md` is updated to reference it.

## Included
- final pre-validation checklist for `support_audit_log_case_id_fkey` (data integrity, constraint state, operational safety)
- explicit go/no-go decision table for an operator to determine Stage 11F readiness
- operator / runbook instructions for when `VALIDATE CONSTRAINT` is safe to run
- stop conditions that block progression to Stage 11F
- rollback / revert guidance if validation fails
- performance and lock considerations for the validation step

## Excluded
- no actual `VALIDATE CONSTRAINT` in this prep stage
- no new FK design changes
- no schema changes or migrations
- no support workflow redesign
- no unrelated service, UI, or realtime changes
