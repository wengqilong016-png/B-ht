# ADR: Stage 10 smoke script follow-up

## Status
Accepted

## Context
PR #189 added a repeatable Stage 10 post-merge smoke checklist and a canonical SQL helper script.

A follow-up is needed because the helper and documentation must align on the actual supported execution path and only reference schema columns guaranteed by the documented Stage 10 model.

## Decision
Open a narrowly scoped follow-up limited to the Stage 10 smoke helper and its documentation.

## Included
- make `scripts/stage10_post_merge_smoke.sql` compatible with the documented execution path
- align the helper with the documented Stage 10 schema columns
- update `DEPLOYMENT.md` and `docs/RUNBOOK.md` so usage instructions are unambiguous

## Excluded
- no business logic changes
- no support case workflow changes
- no audit trail behavior changes
- no unrelated documentation edits
