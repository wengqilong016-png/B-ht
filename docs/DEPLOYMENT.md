# Deployment Guide

This document describes how to configure environment variables for deploying this Vite + React app on Vercel (or locally).

## Package Manager

This project uses **npm**. Always use `npm` commands — do not use `pnpm` or `yarn`.

| Task | Command |
|---|---|
| Install dependencies | `npm ci` |
| Local development | `npm run dev` |
| Production build | `npm run build` |
| Type-check only | `npm run typecheck` |

Always use `npm ci` (not `npm install`) when setting up the project locally or in CI so that
dependencies match `package-lock.json` exactly. Use `npm install` **only** when you intentionally
want to update dependencies and regenerate `package-lock.json`.

> `pnpm-lock.yaml` and `yarn.lock` are listed in `.gitignore` and must not be committed.

## Environment Variables

Only browser-safe frontend variables should be prefixed with `VITE_`. Any secret used by a Vercel Function must stay server-side and must not use the `VITE_` prefix.

| Variable | Description | Required |
|---|---|---|
| `VITE_SUPABASE_URL` | Your Supabase project URL (e.g. `https://xxxx.supabase.co`) | Yes |
| `VITE_SUPABASE_ANON_KEY` | Supabase anonymous/public key | Yes |
| `OPENAI_API_KEY` | Server-side OpenAI API key used by `/api/admin-ai` and `/api/scan-meter` | Optional |
| `GEMINI_API_KEY` | Server-side Gemini API key used by `/api/scan-meter` | Yes, if AI scan is enabled |
| `GOOGLE_TRANSLATE_API_KEY` | Server-side Google Translate API key used by `/api/translate` | Optional |
| `STATUS_API_BASE` | Server-side base URL for an external status API | Optional |
| `INTERNAL_API_KEY` | Server-side key sent as `X-API-KEY` to the status API | Optional |
| `VITE_DISABLE_AUTH` | Local/test-only auth bypass flag; production builds ignore `true` and stay authenticated | Optional |
| `VITE_VERCEL_ANALYTICS_ENABLED` | Set `true` only when Vercel Web Analytics is enabled for this deployment | Optional |

> **Note on Supabase credentials:** `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are required for the app to connect to Supabase. If they are not set, the client is initialized with empty strings and logs a console error: `[Bahati] VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set. Copy .env.example to .env.local and fill in your Supabase project credentials.` There are no built-in fallback credentials — the app will not connect to Supabase until valid values are configured.

> **Security note:** The Supabase service role key (`SUPABASE_KEY`) and all AI keys (`OPENAI_API_KEY`, `GEMINI_API_KEY`) must never be placed in frontend code or any `VITE_` variable. Keep them only in server-side/backend environments.

## Vercel Setup

1. Open your project in the [Vercel dashboard](https://vercel.com/dashboard).
2. Go to **Settings → Environment Variables**.
3. Add each variable from the table above with the appropriate value for each environment (Production, Preview, Development).
4. Redeploy the project after saving the variables.

> **Troubleshooting:** If the app cannot connect to Supabase, check the browser console for an error from `supabaseClient.ts` mentioning missing `VITE_SUPABASE_URL` or `VITE_SUPABASE_ANON_KEY`. This means the env vars are not reaching the build. There are no built-in fallback credentials; set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in the deployment platform and redeploy.

## Local Development

Copy `.env.example` to `.env.local` and fill in your values:

```bash
cp .env.example .env.local
```

`.env.local` contents:

```dotenv
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key_here
VITE_VERCEL_ANALYTICS_ENABLED=false
VITE_DISABLE_AUTH=false
OPENAI_API_KEY=your_openai_api_key_here
GEMINI_API_KEY=your_gemini_api_key_here
GOOGLE_TRANSLATE_API_KEY=your_google_translate_api_key_here
STATUS_API_BASE=http://localhost:5000
INTERNAL_API_KEY=your_internal_api_key_here
```

Then start the dev server:

```bash
npm ci          # install exact versions from package-lock.json
npm run dev     # local development server (http://localhost:3000)
```

> **Use `npm ci` (not `npm install`) for reproducible installs.**
> `.env.local` is listed in `.gitignore` and will not be committed to the repository.

## Automatic Supabase Migration Deployment

The workflow `.github/workflows/supabase-deploy.yml` automatically applies any new
migration files in `supabase/migrations/` to the **production** Supabase project
whenever a commit that touches those files is merged (pushed) to `main`.

### Required GitHub Secrets

Add these three secrets under **Repository → Settings → Secrets and variables → Actions**:

| Secret | Where to find it |
|---|---|
| `SUPABASE_ACCESS_TOKEN` | [supabase.com/account/tokens](https://supabase.com/dashboard/account/tokens) → Generate new token |
| `SUPABASE_DB_PASSWORD` | Supabase Dashboard → **Settings → Database → Database password** |
| `SUPABASE_PROJECT_ID` | Supabase Dashboard → **Settings → General → Reference ID** (e.g. `yctsiudhicztvppddbvk`) |

> ⚠️ `SUPABASE_DB_PASSWORD` grants full database access. Treat it like a root password —
> rotate it immediately if you believe it has been compromised (Supabase Dashboard →
> **Settings → Database → Reset database password**).

Once set, the workflow runs automatically — no manual steps needed.  Any SQL file
added under `supabase/migrations/` and merged to `main` will be pushed to the live
database within seconds.

> **PR preview branches:** The `supabase-preview.yml` workflow handles `db push` for
> each pull request independently, so migrations are verified against a preview
> environment before hitting production.

### Troubleshooting CI Migration Failures

#### Invalid access token format

**Error:** `Invalid access token format. Must be like 'sbp_0102...1920'.`

**Cause:** The `SUPABASE_ACCESS_TOKEN` secret does not have the correct format.

**Fix:**
1. Go to [supabase.com/dashboard/account/tokens](https://supabase.com/dashboard/account/tokens)
2. Generate a new personal access token (it will start with `sbp_`)
3. Update the `SUPABASE_ACCESS_TOKEN` secret in **Repository → Settings → Secrets and variables → Actions**
4. Re-run the failed workflow

> ⚠️ Make sure you're generating a **personal access token** (starts with `sbp_`), not
> the **anon key** or **service role key** from your project settings.

#### IP address not in allow list

**Error:** `Address not in tenant allow_list: {xx, xx, xx, xx}`

**Cause:** Your Supabase project has Network Restrictions enabled that block GitHub Actions runner IPs.

**Fix (Option A - Recommended for production):**
1. Go to Supabase Dashboard → **Settings → Database → Network Restrictions**
2. Add GitHub Actions IP ranges from [api.github.com/meta](https://api.github.com/meta) (look for the `actions` key)
3. Re-run the failed workflow

**Fix (Option B - Quick fix for development):**
1. Go to Supabase Dashboard → **Settings → Database → Network Restrictions**
2. Enable **Allow all IPv4 addresses**
3. Re-run the failed workflow

> ⚠️ Option B exposes your database to the public internet. Use only for development
> projects or temporarily while setting up proper IP allowlists.

#### Connection timeout or network errors

**Error:** `failed to connect to postgres: connection timeout` or similar

**Cause:** Temporary network issue or Supabase service degradation.

**Fix:**
1. Check [status.supabase.com](https://status.supabase.com) for any active incidents
2. Wait a few minutes and re-run the failed workflow
3. If the issue persists, verify your `SUPABASE_PROJECT_ID` is correct


## Supabase Authentication Settings (Production)

After deploying, manually sync the following settings in **Supabase Dashboard → Authentication → Settings**:

| Setting | Value | Reason |
|---|---|---|
| **JWT Expiry** | `604800` (7 days) | Prevents frequent logouts for drivers and admins on slow networks |
| **Refresh Token Reuse Interval** | `60` seconds | Tolerates brief network interruptions without invalidating sessions |

> ⚠️ `supabase/config.toml` only controls the local development environment. Production JWT expiry **must** be set manually in the Supabase Dashboard — it does not update automatically from `config.toml`.

To verify the production settings are applied, log in to Supabase Dashboard → **Authentication → Settings** and confirm **JWT Expiry** shows `604800`.

### Disable Force-Password-Change (one-time)

If users are being prompted to change their password on every login, run the following in **Supabase Dashboard → SQL Editor**:

```sql
UPDATE public.profiles SET must_change_password = FALSE;
```

## Security

See [docs/SECURITY_OPERATIONS.md](docs/SECURITY_OPERATIONS.md) for:

- Credential rotation steps
- Removing sensitive files from Git history
- Setting environment variables in CI/CD

---

## Deployment Checklist — Stages 1 through 11A

Use this checklist when deploying a release that includes any changes from
stages 1 through 11A.  Run each step in order.

### Pre-deploy

- [ ] Run `npm run build` locally — confirm zero TypeScript errors.
- [ ] Run `npm run test:coverage` — confirm all tests pass and coverage does
      not regress.
- [ ] Confirm all required migrations are present in `supabase/migrations/`
      (see table below).
- [ ] Confirm `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and
      `OPENAI_API_KEY` and/or `GEMINI_API_KEY` are set in the deployment platform (Vercel /
      Firebase).
- [ ] Check [status.supabase.com](https://status.supabase.com) — no active
      incidents.

### Migration verification

All schema objects are created by `supabase/schema.sql`. To verify they exist:

| Object | Verification query |
|--------|-------------------|
| `calculate_finance_v2()` | `SELECT proname FROM pg_proc WHERE proname = 'calculate_finance_v2';` |
| `submit_collection_v2()` | `SELECT proname FROM pg_proc WHERE proname = 'submit_collection_v2';` |
| `queue_health_reports` table | `SELECT to_regclass('public.queue_health_reports');` |
| `health_alerts` table | `SELECT to_regclass('public.health_alerts');` |
| `support_audit_log` table | `SELECT to_regclass('public.support_audit_log');` |
| `support_cases` table | `SELECT to_regclass('public.support_cases');` |

### Post-deploy verification

**Finance preview (Stage 1/2)**
- [ ] Open the Collect form, enter a score above `lastScore` for any site.
- [ ] Confirm the finance summary updates in real time (server preview path).
- [ ] Toggle offline (DevTools → Network → Offline) — summary should still
      update using the local fallback.

**Server-authoritative write path (Stage 2)**
- [ ] Submit a test collection as a driver.
- [ ] Confirm the transaction appears in Admin → History with
      `isSynced: true`.
- [ ] Verify `source = 'server'` on the transaction record in Supabase.

**Offline queue and replay (Stage 3)**
- [ ] Set DevTools → Offline, submit a collection.
- [ ] Confirm Admin → Local Queue Diagnostics shows the item as pending.
- [ ] Restore network.  Within 20 seconds the item should sync and disappear
      from the queue.

**Authentication + profile bootstrap**
- [ ] Open the login page with a provisioned admin or driver account.
- [ ] Sign in with valid credentials.
- [ ] Confirm no login error banner shows `Profile not found`, `Invalid role`, or their localized equivalents.
- [ ] Confirm the app transitions into the authenticated shell instead of staying on the login form.
- [ ] For driver accounts, confirm the driver workspace loads; for admin accounts, confirm the admin console loads.

**Fleet-wide diagnostics (Stage 6)**
- [ ] Open Admin → Fleet-Wide Diagnostics.
- [ ] Confirm the active driver list is visible and no snapshots are stale.
- [ ] Run: `SELECT COUNT(*) FROM queue_health_reports;` — expect > 0 rows.

**Health alerts (Stage 8 / 8.1)**
- [ ] Open Admin → Health Alerts.
- [ ] Confirm the panel loads without errors.
- [ ] Run `SELECT generate_health_alerts();` in SQL Editor to verify the
      function exists and executes without error.
- [ ] Confirm pg_cron job `generate-health-alerts` is scheduled:

```sql
SELECT jobname, schedule, command, active
FROM cron.job
WHERE jobname = 'generate-health-alerts';
```

**Support case linking & audit trail (Stage 9)**
- [ ] Open Admin → Audit Trail (sidebar: 操作审计).
- [ ] Confirm the panel loads without errors (empty state is expected on a fresh deploy).
- [ ] Open Admin → Cases (sidebar: 支持工单).
- [ ] Confirm the panel loads without errors and the create form works.
- [ ] Create a case → confirm `recovery_action` event appears in the audit trail.
- [ ] Close a case → confirm `recovery_action` event appears in the audit trail.
- [ ] Open Admin → Local Queue Diagnostics — confirm case picker dropdown is visible.
- [ ] Open Admin → Fleet-Wide Diagnostics — confirm case picker dropdown is visible in export filters.
- [ ] Open Admin → Health Alerts — confirm case picker dropdown and Link buttons are visible.
- [ ] Confirm cross-navigation: Cases → History → case badge click → Cases.
- [ ] Confirm both tables exist:

```sql
SELECT COUNT(*) FROM public.support_audit_log;
SELECT COUNT(*) FROM public.support_cases;
```

**Case resolution workflow (Stage 10)**
- [ ] Open Admin → Cases → click **Detail** on an open case.
- [ ] Confirm case detail view loads with metadata grid and resolution form.
- [ ] Select an outcome, add resolution notes, click **Resolve Case**.
- [ ] Confirm the case status changes to `closed` and resolution metadata is saved.
- [ ] Confirm a `case_resolved` audit event appears in the linked history.
- [ ] Open a closed resolved case detail → confirm resolution notes and outcome are shown read-only.
- [ ] Run the following smoke check in Supabase SQL Editor (replace `CASE-2026-001` with the case you just resolved) and confirm all checks pass.
- [ ] Confirm the resolution columns exist:

```sql
SELECT resolution_notes, resolved_by, resolved_at, resolution_outcome
FROM public.support_cases LIMIT 1;
```

**caseId normalization (Stage 11A)**
- [ ] Confirm the `support_audit_log_case_id_not_blank` CHECK constraint exists:

```sql
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'public.support_audit_log'::regclass
  AND conname = 'support_audit_log_case_id_not_blank';
```

- [ ] Confirm no blank/whitespace-only `case_id` values exist:

```sql
SELECT COUNT(*) AS blank_case_ids
FROM public.support_audit_log
WHERE case_id IS NOT NULL
  AND length(btrim(case_id)) = 0;
```

- [ ] Verify `recordAuditEvent` still works (fire-and-forget) by creating a case or triggering an export in the UI. Confirm the audit event appears in Admin → Audit Trail.

### Stage 10 post-merge smoke SQL (repeatable)

Run the following in Supabase SQL Editor, replacing `CASE-2026-001` with the case you just resolved via UI:

```sql
-- 1) Validate the case exists and is closed.
SELECT id, status, resolution_outcome, resolution_notes, resolved_by, resolved_at
FROM public.support_cases WHERE id = 'CASE-2026-001';

-- 2) Validate one case_resolved audit event exists.
SELECT id, case_id, event_type, actor_id, created_at
FROM public.support_audit_log WHERE case_id = 'CASE-2026-001' AND event_type = 'case_resolved';

-- 3) Confirm event_type CHECK includes 'case_resolved'.
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'public.support_audit_log'::regclass AND conname = 'support_audit_log_event_type_check';
```

Expect:
   - `support_cases` row shows `status='closed'` and non-null resolution metadata.
   - one `case_resolved` row exists in `support_audit_log` for the same case.
   - `event_type` CHECK includes `case_resolved`.

Quick one-liner alternative:

```sql
SELECT id, status, resolution_outcome, resolved_by, resolved_at
FROM public.support_cases
WHERE id = '<case_id>';

SELECT event_type, actor_id, created_at
FROM public.support_audit_log
WHERE case_id = '<case_id>' AND event_type = 'case_resolved'
ORDER BY created_at DESC;
```

### Rollback

If any post-deploy check fails:

1. Revert the deployment to the previous build in the hosting platform to
   stop new traffic hitting the bad release.  **This only affects the app
   code and does _not_ roll back any Supabase migrations or data.**
2. Run `supabase db push --dry-run` locally to confirm whether there are
   any **pending** migrations.  This command shows what _would be applied_
   if you ran `supabase db push`; it does **not** perform or describe any
   rollback.
3. If a database migration caused the issue, identify the specific change
   (using Supabase migration history, the SQL Editor, and `setup_db.sql`)
   and create a new **forward-only** migration that repairs the problem
   (for example, restore a dropped column, relax a constraint, or backfill
   bad data).  Do not delete or roll back already-applied migrations in
   production; other features may depend on them.
4. Apply the corrective migration using the normal Supabase workflow
   (`supabase db push` for staging, then promote to production via the
   standard deploy process).
5. Open an incident in the team channel with the failing check, details of
   the corrective migration applied, and the relevant Supabase log output.

---

## Operator Runbook

See [docs/RUNBOOK.md](docs/RUNBOOK.md) for:

- Daily operations checklist
- Stage-by-stage verification procedures
- Manual replay instructions for dead-letter items
- Common troubleshooting scenarios
- Escalation and contact matrix
