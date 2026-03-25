# ADR: Stage 11C — support relationship data cleanup

## Status
Proposed

## Context
Stage 11A introduced service-side `caseId` normalization and a lightweight non-blank CHECK on `support_audit_log.case_id`.

Stage 11B baseline analysis is intended to measure whether historical and normalized `case_id` values are clean enough to safely move toward a future foreign-key stage.

Before any FK can be introduced, the system needs a narrowly scoped cleanup stage that reconciles historical values, defines canonical handling for non-matching case references, and preserves audit readability.

## Decision
Open a narrowly scoped Stage 11C focused on support relationship data cleanup and migration strategy.

## Included
- read-only baseline result interpretation and cleanup plan
- cleanup rules for blank / trimmed / case-variant / orphan `case_id` values
- minimal migrations or scripts needed to safely normalize historical data
- focused tests and docs for any cleanup behavior introduced in this stage
- explicit preparation for a later Stage 11D NOT VALID FK step

## Excluded
- no immediate foreign key introduction
- no VALIDATE CONSTRAINT step
- no alias/case registry expansion unless explicitly required by discovered data
- no broad support workflow redesign
- no unrelated shell, realtime, or admin/driver refactors
