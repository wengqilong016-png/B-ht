# ADR: Stage 12B — shell view boundary

## Status
Accepted

## Context
Stage 12A already moved driver submit orchestration out of `SubmitReview` into a dedicated service boundary, reducing shell-adjacent coupling in the submit path.

In this stage, both `AppAdminShell` and `AppDriverShell` still carried small but repeated shell-layer responsibilities:

- admin approval badge derivation logic inline in shell
- dashboard-backed admin view gating logic inline in shell
- duplicated shell loading fallback UI in both shell files
- driver current-driver resolution expression repeated inline

## Decision
Continue Stage 12 boundary hardening by extracting shell-only derived view-state logic and shared fallback UI into focused modules:

- `admin/adminShellViewState.ts`
  - `calculateAdminApprovalBadge(...)`
  - `isDashboardBackedAdminView(...)`
- `driver/driverShellViewState.ts`
  - `resolveCurrentDriver(...)`
- `shared/ShellLoadingFallback.tsx`
  - shared shell loading fallback component used by both shells

`AppAdminShell` and `AppDriverShell` now consume these extracted helpers/components while preserving existing behavior.

## Included
- shell-level derived state extraction for admin approval badge and dashboard-backed view checks
- shell-level driver resolution extraction for driver shell
- shared shell loading fallback component reuse across admin and driver shells
- focused unit tests for extracted pure functions

## Excluded
- no route changes
- no database/schema changes
- no business workflow changes
- no support workflow changes
- no realtime core logic changes
