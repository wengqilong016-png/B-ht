# ADR: Stage 13 — support caseId audit trail lookup index

## Status
Accepted

## Context
Stages 11A through 11D introduced `case_id` normalization, data cleanup,
and a NOT VALID foreign-key constraint linking `support_audit_log.case_id`
to `support_cases.id`.

Audit trail detail views frequently filter on `case_id` with newest-first
ordering. Without a dedicated composite index this access pattern relies on
the single-column `case_id` index from Stage 9 plus a sort step.

Current application queries use exact equality after service-side
normalization (`eq('case_id', normalizedCaseId)`), so plain column indexes
are the correct match for the planner. Expression indexes using
`lower(btrim(...))` were considered but excluded because no current query
path uses that canonical form.

## Decision
Add a single composite index on `support_audit_log (case_id, created_at DESC)`
with a `WHERE case_id IS NOT NULL` partial predicate. This directly supports
the most common audit trail access pattern without altering the schema or
application behavior.

### Index introduced

| Index | Table | Columns | Predicate |
|---|---|---|---|
| `support_audit_log_case_id_created_at_idx` | `support_audit_log` | `(case_id, created_at DESC)` | `WHERE case_id IS NOT NULL` |

### Query pattern supported

- **Audit trail newest-first** — `WHERE case_id = $1 ORDER BY created_at DESC`
  on `support_audit_log`.

## Included
- one CREATE INDEX IF NOT EXISTS statement in a single migration file
- partial-index predicate (`WHERE case_id IS NOT NULL`) to skip null rows
- focused tests validating the migration SQL content
- RUNBOOK section for Stage 13

## Excluded
- no expression indexes (`lower(btrim(...))`) — not matched by current queries
- no schema redesign
- no UI changes
- no service logic changes
- no foreign-key changes
- no caseId semantic changes
