# ADR: Stage 11A — support relationship soft hardening

## Status
Proposed

## Context
Support relationship evaluation concluded that `support_audit_log.case_id` should not move directly to a hard foreign key yet.

The current model still allows optional/free-form case IDs in parts of the workflow, and historical data compatibility must be measured before hard constraints are introduced.

## Decision
Open a narrowly scoped Stage 11A focused on soft hardening only.

## Included
- normalize support-related caseId inputs at the application/service boundary
- collapse blank case IDs to `NULL`
- add lightweight database constraints that block empty/blank values without introducing a foreign key
- add focused tests for normalization and blank handling
- update runbook/deployment guidance with baseline SQL checks and the current non-FK status

## Excluded
- no foreign key on `support_audit_log.case_id`
- no historical data cleanup migration beyond read-only baseline checks
- no alias/case registry design
- no broad support workflow redesign
- no unrelated shell/data-layer refactors
