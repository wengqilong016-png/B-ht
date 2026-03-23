# Bahati Jackpots — Operator & Support Runbook

> Scope: stages 1 through 8.1.  
> Audience: system operators, on-call support engineers.

---

## Table of Contents

1. [Architecture Quick-Reference](#1-architecture-quick-reference)
2. [Daily Operations Checklist](#2-daily-operations-checklist)
3. [Finance Preview Verification (Stage 1/2)](#3-finance-preview-verification-stage-12)
4. [Server-Authoritative Write Path (Stage 2)](#4-server-authoritative-write-path-stage-2)
5. [Offline Queue & Replay (Stage 3)](#5-offline-queue--replay-stage-3)
6. [Local Queue Diagnostics (Stage 4)](#6-local-queue-diagnostics-stage-4)
7. [Manual Replay of Dead-Letter Items (Stage 5)](#7-manual-replay-of-dead-letter-items-stage-5)
8. [Fleet-Wide Diagnostics (Stage 6)](#8-fleet-wide-diagnostics-stage-6)
9. [Support Export Workflow (Stage 7)](#9-support-export-workflow-stage-7)
10. [Health Alerts (Stage 8 / 8.1)](#10-health-alerts-stage-8--81)
11. [Common Troubleshooting Scenarios](#11-common-troubleshooting-scenarios)
12. [Escalation & Contact Matrix](#12-escalation--contact-matrix)

---

## 1. Architecture Quick-Reference

```
Driver device (browser/PWA)
  │
  ├─ Online path ──────────▶ submit_collection_v2 (Supabase RPC)
  │                              └─ server computes finance, persists row
  │
  └─ Offline path ─────────▶ IndexedDB / localStorage queue
                                 └─ flushQueue() on reconnect
                                       └─ replayDeadLetterItem() for stuck items

Admin panel
  ├─ Local Queue Diagnostics  ─ shows this browser's queue state
  ├─ Fleet-Wide Diagnostics   ─ shows queue_health_reports table (all devices)
  └─ Health Alerts            ─ shows health_alerts table (server-generated)

Supabase (PostgreSQL + Edge Functions)
  ├─ queue_health_reports    ─ upserted by driver devices after each sync
  ├─ health_alerts           ─ upserted by pg_cron job every 15 min
  └─ transactions            ─ canonical source of truth for collections
```

---

## 2. Daily Operations Checklist

Run this check every morning before driver routes begin.

| # | Check | Where | Pass criteria |
|---|-------|-------|---------------|
| 1 | Health Alerts panel shows no critical alerts | Admin → Health Alerts | Zero `dead_letter_items` critical alerts |
| 2 | Fleet diagnostics shows all expected drivers | Admin → Fleet-Wide Diagnostics | Every active driver has a non-stale snapshot |
| 3 | No device has `deadLetterCount > 0` | Admin → Fleet-Wide Diagnostics | All values show 0 |
| 4 | Supabase Dashboard → Database → is responding | Supabase Dashboard | No connection errors |
| 5 | `queue_health_reports` table has recent rows | SQL Editor (see query below) | Rows within the last 2 hours |

**Quick SQL — recent fleet health:**
```sql
SELECT device_id, driver_name, dead_letter_count, reported_at
FROM queue_health_reports
ORDER BY reported_at DESC
LIMIT 20;
```

---

## 3. Finance Preview Verification (Stage 1/2)

The finance preview uses `calculate_finance_v2` (Supabase RPC) with a local
fallback when offline.

### How to verify the server preview is working

1. Log in as an **admin** and open **Collect**.
2. Select any location and enter a score higher than `lastScore`.
3. Observe the finance summary update in real time.
4. Open the browser console — there should be **no** `[Bahati]` error logs.
5. Temporarily disable network (DevTools → Network → Offline), re-enter the
   score. The preview should still update using the **local** calculation path.

### What to check if preview shows wrong numbers

- Confirm `calculate_finance_v2` exists: **Supabase Dashboard → Database → Functions**.
- Check that `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set
  (missing env vars cause the Supabase client to initialize with empty
  credentials, logging a console error; see Scenario E in Section 11).
- Compare local vs. server commission rate: local uses `location.commissionRate`
  or `CONSTANTS.DEFAULT_PROFIT_SHARE` (15%); server uses the same inputs via
  `p_commission_rate`.  If they diverge, a location's `commissionRate` column
  may differ from the UI's cached value.

---

## 4. Server-Authoritative Write Path (Stage 2)

Every collection submission goes through `submit_collection_v2` (Supabase RPC)
when online.  The server is the **only** authority for finance totals on the
write path — the client never persists a self-computed finance result as final.

### Verifying a submitted transaction

1. Open **Admin → History**.
2. Locate the transaction by driver name, date, or location.
3. Confirm `isSynced: true` is shown (green sync badge).
4. Cross-check the `netPayable` value against the SQL view in Supabase:

```sql
SELECT id, net_payable, is_synced, source
FROM transactions
WHERE id = '<txId>';
```

### If a submission fails (online) 

The service returns `{ success: false, error: '...' }` and the caller falls
back to the offline queue path.  Check:
- Supabase RPC logs: **Dashboard → Database → Logs → postgres**.
- The error message is surfaced in the driver UI (红色错误提示).
- The transaction should appear in the **Local Queue Diagnostics** panel with
  `retryCount = 0` (first attempt pending).

---

## 5. Offline Queue & Replay (Stage 3)

Driver transactions are queued in IndexedDB (with localStorage fallback) when
Supabase is unavailable.  The queue is flushed automatically when connectivity
is restored.

### Queue item lifecycle

```
enqueued (isSynced=false, retryCount=0)
    │
    ├─ flushQueue() success  ──▶  markSynced()  ──▶  isSynced=true
    │
    └─ flushQueue() failure
           ├─ transient error  ──▶  exponential backoff, retryCount++
           └─ permanent error  ──▶  dead-letter immediately (retryCount = MAX_RETRIES=5)
              retryCount >= MAX_RETRIES ──▶ dead-letter
```

### Verifying offline replay works

1. Open DevTools → Network → set "Offline".
2. Submit a collection as a driver.
3. Check **Admin → Local Queue Diagnostics**: the item appears with
   `isSynced: false`.
4. Restore network.  Within 20 seconds the 20-second sync loop fires.
5. Confirm the item disappears from the queue and appears in **History** with
   `isSynced: true`.

---

## 6. Local Queue Diagnostics (Stage 4)

**Admin → Local Queue Diagnostics** shows the queue state of the **currently
open browser session only**.  It does not show other drivers' queues.

| Column | Meaning |
|--------|---------|
| Pending | Items enqueued, not yet attempted |
| Retry-waiting | Items that failed transiently and are waiting for backoff |
| Dead-letter | Items that exceeded `MAX_RETRIES` (5) or hit a permanent error |

> ⚠️ If an admin checks this panel while logged in, they see **their own** local
> queue (which is normally empty).  To see driver queues, use Fleet-Wide
> Diagnostics (Stage 6).

---

## 7. Manual Replay of Dead-Letter Items (Stage 5)

Dead-letter items can be replayed manually by an admin or the driver who owns
the item.

### Eligibility criteria
- `isSynced === false`
- `retryCount >= MAX_RETRIES` (5)

Items that do not meet these criteria will return an ineligibility reason via
`getReplayIneligibilityReason()`.

### Steps to replay via the UI

1. Navigate to **Admin → Local Queue Diagnostics**.
2. Locate the dead-letter item.
3. Click **Replay**.
4. The system re-submits using the stored `rawInput` via `submit_collection_v2`.
5. On success: item is marked `isSynced: true`.
6. On failure: `retryCount` is incremented; if it exceeds threshold again, the
   item returns to dead-letter state.

### Manual replay via Supabase SQL (last resort)

If the driver's browser is inaccessible, an operator can replay directly:

```sql
-- Inspect the dead-letter item first
SELECT id, raw_input, retry_count, last_error
FROM transactions
WHERE is_synced = false
  AND retry_count >= 5
  AND driver_id = '<driverId>';

-- After verifying, manually submit via the RPC
SELECT submit_collection_v2(
  p_tx_id            := '<txId>',
  p_location_id      := '<locationId>',
  p_driver_id        := '<driverId>',
  p_current_score    := <score>,
  p_expenses         := <expenses>,
  p_tip              := 0,
  p_is_owner_retaining := false,
  p_owner_retention  := NULL,
  p_coin_exchange    := <coinExchange>,
  p_gps              := NULL,
  p_photo_url        := NULL,
  p_ai_score         := NULL,
  p_anomaly_flag     := false,
  p_notes            := NULL,
  p_expense_type     := NULL,
  p_expense_category := NULL,
  p_reported_status  := 'active'
);
```

---

## 8. Fleet-Wide Diagnostics (Stage 6)

**Admin → Fleet-Wide Diagnostics** reads the `queue_health_reports` Supabase
table, showing one row per device.

### Staleness

A snapshot is **stale** when `reportedAt` is older than 2 hours
(`STALE_THRESHOLD_MS`).  Stale snapshots indicate the device has not synced
recently — the driver may be offline, or the device may have crashed.

### When a device shows as stale

1. Contact the driver to confirm their connectivity.
2. Ask the driver to open the app — the next sync will refresh the snapshot.
3. If the driver is unreachable, check the `queue_health_reports` table:

```sql
SELECT device_id, driver_name, dead_letter_count, reported_at,
       NOW() - reported_at::timestamptz AS age
FROM queue_health_reports
WHERE device_id = '<deviceId>';
```

### Fleet summary totals

Totals shown in the UI are computed **from non-stale snapshots only**.  Stale
devices are listed separately so operators can distinguish active fleet health
from potentially obsolete data.

---

## 9. Support Export Workflow (Stage 7)

When a support issue requires offline queue data, an admin can download a
JSON export from the diagnostics panels.

### Local device export

1. Open **Admin → Local Queue Diagnostics**.
2. Click **Export JSON**.
3. The file is named `bahati-local-diagnostics-<timestamp>.json`.
4. The export contains only support-relevant fields (no GPS, no photo data,
   no raw finance details beyond what is needed for triage).

### Fleet-wide export

1. Open **Admin → Fleet-Wide Diagnostics**.
2. Optionally filter by driver ID, device ID, or error state.
3. Click **Export JSON**.
4. The file is named `bahati-fleet-diagnostics-<timestamp>.json`.

### What the export contains

| Field | Included |
|-------|----------|
| Transaction IDs | ✓ |
| Driver / device identifiers | ✓ |
| Error messages and retry counts | ✓ |
| Queue health summary | ✓ |
| GPS coordinates | ✗ (excluded for privacy) |
| Photos / AI scores | ✗ |
| Raw finance totals | ✗ |

Exports are read-only and safe to send to support channels.

---

## 10. Health Alerts (Stage 8 / 8.1)

Health alerts are generated **server-side** by the `generate_health_alerts()`
pg_cron job every 15 minutes, and are visible in **Admin → Health Alerts**.

### Alert types and severity

| Type | Severity | Trigger |
|------|----------|---------|
| `dead_letter_items` | Critical | Any dead-letter count ≥ 1 |
| `stale_snapshot` | Warning | Device snapshot older than 2 hours |
| `high_retry_waiting` | Warning | `retryWaiting > 5` |
| `high_pending` | Info | `pending > 20` |

### Alert lifecycle

Alerts are **upserted** (not duplicated) — if the same condition persists, the
existing alert row is updated in place.  Alerts are automatically resolved when
the triggering condition clears (next pg_cron run).

### If the Health Alerts panel shows no data

1. Confirm pg_cron is enabled: **Supabase Dashboard → Database → Extensions →
   pg_cron**.
2. Check the `health_alerts` table directly:

```sql
SELECT alert_type, severity, device_id, driver_name, created_at, resolved_at
FROM health_alerts
ORDER BY created_at DESC
LIMIT 20;
```

3. If the table is empty, manually invoke the function to test:

```sql
SELECT generate_health_alerts();
```

4. Check `queue_health_reports` has rows — if that table is empty, drivers
   have not synced yet and there is nothing to alert on.

### Acknowledging / suppressing alerts (operator action)

There is no automated suppression.  To mark a resolved condition:
- Fix the underlying issue (replay dead-letter items, restore connectivity).
- The pg_cron job will mark the alert `resolved_at` on its next run.

---

## 11. Common Troubleshooting Scenarios

### Scenario A — Driver says collection was submitted but does not appear in History

1. Check **Admin → Fleet-Wide Diagnostics** for the driver's device.
2. If `pendingCount > 0`, the item is queued but not yet synced.  Ask the
   driver to confirm they have network connectivity.
3. If `deadLetterCount > 0`, replay via **Admin → Local Queue Diagnostics**
   (driver must be on the same device) or use the SQL manual replay above.
4. If neither table has a matching entry, check the Supabase `transactions`
   table directly.

### Scenario B — Finance preview shows different numbers than the final transaction

This is expected when the preview was computed locally (offline) and the server
write recalculates using authoritative data.  To investigate:
- Compare `source` field in the transaction: `'server'` means the RPC was used.
- Check whether `commissionRate` on the location was recently changed by an
  admin — the cached value in the driver's local state may differ.

### Scenario C — Entire fleet shows stale snapshots

Likely causes:
1. Supabase is down or the `queue_health_reports` table is unavailable.
2. A migration was applied that changed the table schema without updating
   `reportQueueHealthToServer()` in `offlineQueue.ts`.

Check Supabase status: [status.supabase.com](https://status.supabase.com)

### Scenario D — Health Alerts panel is empty but known issues exist

1. pg_cron may not be running.  Check: **Dashboard → Database → Extensions**.
2. `queue_health_reports` may be empty (devices haven't synced).
3. The alert thresholds may not be met — current thresholds are:
   `deadLetter ≥ 1`, `retryWaiting > 5`, `pending > 20`.

### Scenario E — App cannot connect to Supabase

Check the browser console for errors from `supabaseClient.ts` initialization
that mention missing or invalid `VITE_SUPABASE_URL` or `VITE_SUPABASE_ANON_KEY`
environment variables.  The actual error message logged is:

```
[Bahati] VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set. Copy .env.example to .env.local and fill in your Supabase project credentials.
```

If this error appears, the deployment environment variables are missing or
misconfigured.  There are no built-in fallback project credentials — the
Supabase client is initialized with empty strings, and the app will not be
able to connect to Supabase until valid values are provided.
Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in the deployment
platform (Vercel / Firebase) and redeploy.

---

## 12. Escalation & Contact Matrix

| Issue | Owner | Escalation path |
|-------|-------|-----------------|
| Supabase outage | Supabase SaaS | [status.supabase.com](https://status.supabase.com) |
| Dead-letter items cannot be replayed | Dev team | Open GitHub issue with export JSON attached |
| Finance calculation discrepancy | Dev team | Include `txId`, `locationId`, and both local/server values |
| pg_cron alerts not firing | Dev team | Include output of `SELECT generate_health_alerts()` |
| Credential rotation needed | Security | Follow `docs/SECURITY_OPERATIONS.md` → Section 1 |

---

## 13. Support Case Linking & Audit Trail (Stage 9)

### Overview

Stage 9 adds a lightweight support case entity and audit trail for support and
recovery actions, with case linking integrated into the diagnostics, health
alerts, and manual replay workflows.

**DB tables:**
- `support_cases` (migration `20260323030000_support_cases.sql`) — lightweight
  case entity with id, title, status (open/closed), timestamps.
- `support_audit_log` (migration `20260322210000_support_audit_log.sql`) —
  append-only operator audit trail.
- CHECK constraints (migration `20260323040000_support_check_constraints.sql`) —
  enforces `status IN ('open','closed')` and valid `event_type` values at the DB level.

**Service:** `services/supportCaseService.ts`.

**Admin UI:**
- Admin Console → **Cases** (sidebar: 支持工单) — create, list, close cases.
  Each case row shows linked event count. Creating/closing a case records a
  `recovery_action` audit event automatically.
- Admin Console → **Audit Trail** (sidebar: 操作审计) — view all audit events.
  Case ID badges are clickable for cross-navigation to Cases.
- **Local Queue** panel — case picker links replays and exports to an existing case.
- **Fleet Diag.** panel — case picker links fleet exports to an existing case.
- **Alerts** panel — case picker + Link button links health alerts to a case.

All action panels use a shared **CasePicker** dropdown that fetches open cases
from the `support_cases` table. Manual free-text entry is available only when no
open cases exist (e.g. fresh deploy); once real cases are created, operators must
select from the dropdown to ensure valid linkage.

### Event types

| Event type | When it is written |
|---|---|
| `diagnostic_export` | Operator triggers a local or fleet diagnostics export |
| `health_alert_linked` | Operator links a health alert to a support case |
| `manual_replay_attempted` | Operator starts a dead-letter manual replay |
| `manual_replay_succeeded` | Manual replay completed successfully |
| `manual_replay_failed` | Manual replay failed (error in payload) |
| `recovery_action` | Generic operator recovery step |

### How audit events are recorded automatically

Audit events are recorded automatically in the following workflows:

- **Local Queue → Export**: records `diagnostic_export` with export scope and
  filename, enriched with case ID if set.
- **Local Queue → Replay**: records `manual_replay_attempted` when a replay
  starts, then `manual_replay_succeeded` or `manual_replay_failed` on
  completion.
- **Fleet Diag. → Export**: records `diagnostic_export` with fleet scope,
  enriched with case ID if set.
- **Alerts → Link**: records `health_alert_linked` with alert type, severity,
  and device ID.
- **Cases → Create**: records `recovery_action` with the new case ID and title.
- **Cases → Close**: records `recovery_action` with the closed case ID.

### How to write an audit event (service layer)

```typescript
import { recordAuditEvent } from '../services/supportCaseService';

// fire-and-forget — never throws
await recordAuditEvent(supabase, {
  caseId:    'CASE-2026-001',          // optional free-form reference
  eventType: 'manual_replay_attempted',
  actorId:   currentUser.id,
  payload:   { txId: 'tx-abc', driverId: 'drv-1' },
});
```

### How to attach a case ID to an export

```typescript
import { addCaseIdToExportPayload } from '../services/supportCaseService';

const enriched = addCaseIdToExportPayload(localPayload, 'CASE-2026-001');
triggerJSONDownload(enriched, filename);
```

### Managing support cases

```typescript
import { createSupportCase, fetchSupportCases, resolveSupportCase } from '../services/supportCaseService';

// Create
const supportCase = await createSupportCase(supabase, {
  id: 'CASE-2026-001',
  title: 'Dead-letter investigation for device X',
  createdBy: currentUser.id,
});

// List (optionally filter by status)
const cases = await fetchSupportCases(supabase, { status: 'open' });

// Resolve (with metadata — preferred over direct close)
await resolveSupportCase(supabase, {
  caseId: 'CASE-2026-001',
  resolutionNotes: 'Root cause was a transient network timeout; replayed successfully.',
  resolutionOutcome: 'fixed',
  resolvedBy: 'operator-auth-user-id',
});
```

### Viewing the audit trail

Open Admin Console → **Audit Trail**.  Enter a support case ID in the filter
box to narrow to events for a specific case.  The panel auto-refreshes every
60 seconds.

Alternatively, open **Cases**, find the case of interest, and click
**History** to navigate directly to the Audit Trail filtered by that case.

### Scenario F — Audit trail panel shows "Failed to fetch audit log"

1. Confirm `support_audit_log` table exists:
   ```sql
   SELECT COUNT(*) FROM public.support_audit_log;
   ```
2. Confirm the admin user has the `admin` role in `profiles`.
3. Check Supabase RLS policies on `support_audit_log` — admins need `SELECT`,
   authenticated users need `INSERT`.

### Scenario G — Support cases panel shows "Failed to fetch support cases"

1. Confirm `support_cases` table exists:
   ```sql
   SELECT COUNT(*) FROM public.support_cases;
   ```
2. Confirm the admin user has the `admin` role in `profiles`.
3. Check Supabase RLS policies on `support_cases` — admins need `SELECT`,
   `INSERT`, and `UPDATE`.

---

## Stage 10 — Support Case Resolution Workflow

### Overview

Stage 10 adds an explicit case resolution workflow.  Operators can now open a
case detail view, add resolution notes, select an outcome, and mark the case
as resolved with full traceability metadata.

### Components

| Component | Purpose |
|-----------|---------|
| `CaseDetail` | Detail view for a single case; resolution form; linked audit history |
| `SupportCases` (updated) | Case list with "Detail" button to navigate to CaseDetail |
| `AuditTrail` (updated) | New `case_resolved` event type displayed in timeline |
| `supportCaseService.ts` (updated) | `fetchSupportCaseById()`, `resolveSupportCase()`, `case_resolved` audit event type |

### Resolution Fields

| Field | Column | Description |
|-------|--------|-------------|
| Resolution Notes | `resolution_notes` | Free-form operator notes (max 500 chars) |
| Resolved By | `resolved_by` | Actor who resolved the case |
| Resolved At | `resolved_at` | Timestamp of resolution |
| Outcome | `resolution_outcome` | One of: `fixed`, `wont-fix`, `duplicate`, `cannot-reproduce`, `other` |

### Migration

`20260323100000_case_resolution.sql` adds:
- Four nullable columns to `support_cases` (resolution_notes, resolved_by,
  resolved_at, resolution_outcome)
- Extends the `support_audit_log.event_type` CHECK constraint to allow
  `case_resolved`

### Scenario H — Resolving a case

1. Open Admin Console → **Cases**.
2. Click **Detail** on the case to resolve.
3. Select an **Outcome** and optionally add **Resolution Notes**.
4. Click **Resolve Case**.
5. The case status changes to `closed` and the resolution metadata is saved.
6. A `case_resolved` audit event is recorded automatically.

### Scenario I — Viewing resolution metadata on a closed case

1. Open Admin Console → **Cases** → click **Detail** on a closed case.
2. Resolution notes, resolved by, resolved at, and outcome are shown in the
   metadata grid.  Notes are shown in a separate read-only section.

### Scenario J — Case detail shows "Failed to load case"

1. Confirm the case ID exists in `support_cases`.
2. Confirm the admin user has the `admin` role.
3. Check Supabase RLS policies on `support_cases`.

---

*Last updated: 2026-03-23. Covers stages 1 through 10.*
