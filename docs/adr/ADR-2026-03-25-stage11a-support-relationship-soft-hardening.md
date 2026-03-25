# ADR: Stage 11A — support relationship soft hardening

## Status
Accepted

## Context
Support relationship evaluation concluded that `support_audit_log.case_id` should not move directly to a hard foreign key yet.

The current model still allows optional/free-form case IDs in parts of the workflow, and historical data compatibility must be measured before hard constraints are introduced.

## Decision
Open a narrowly scoped Stage 11A focused on soft hardening only.

## Included
- normalize support-related `caseId` inputs at the application/service boundary
- collapse blank case IDs to `NULL`
- add lightweight database constraints that block empty/blank values without introducing a foreign key
- add focused tests for normalization and blank handling
- update runbook/deployment guidance with baseline SQL checks and the current non-FK status

### Implementation details

**Service-layer normalization** (`services/supportCaseService.ts`):
- New exported helper: `normalizeCaseId(caseId)` — trims whitespace, collapses
  blank/whitespace-only to `null`, passes `null`/`undefined` through as `null`.
- `recordAuditEvent()` — normalizes `caseId` before insert.
- `fetchAuditLog()` — normalizes `caseId` filter before querying (symmetry with write path).
- `filterAuditEventsByCaseId()` — normalizes `caseId` filter parameter.
- `addCaseIdToExportPayload()` — normalizes `caseId` before attaching to payload.

**Database constraint** (`20260325000000_stage11a_case_id_blank_check.sql`):
```sql
CHECK (case_id IS NULL OR length(btrim(case_id)) > 0) NOT VALID
```
- Added as `NOT VALID` so the migration does not scan existing rows.  This
  prevents deployment failure if historical data contains blank/whitespace-only
  `case_id` values.  New inserts and updates are still enforced immediately.
- `NULL` is still allowed (fire-and-forget inserts without a case reference).
- Empty string `''` and whitespace-only `'   '` are rejected for new writes.
- A future stage (11E) may `VALIDATE` the constraint after baseline data cleanup.
- No foreign key is introduced.

**Test matrix** (added to `__tests__/supportCase.test.ts`):
- `normalizeCaseId`: undefined → null, null → null, `''` → null, `'   '` → null, `'  X  '` → `'X'`, `'X'` → `'X'`
- `recordAuditEvent`: trim, blank → null, whitespace-only → null
- `fetchAuditLog`: trim filter, whitespace-only filter → no filter applied
- `filterAuditEventsByCaseId`: trim filter, whitespace-only → empty array
- `addCaseIdToExportPayload`: trim before attach, whitespace-only → payload unchanged

## Excluded
- no foreign key on `support_audit_log.case_id`
- no historical data cleanup migration beyond read-only baseline checks
- no alias/case registry design
- no broad support workflow redesign
- no unrelated shell/data-layer refactors

