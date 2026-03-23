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

All frontend variables **must** be prefixed with `VITE_` so that Vite exposes them to the browser bundle via `import.meta.env`.

| Variable | Description | Required |
|---|---|---|
| `VITE_SUPABASE_URL` | Your Supabase project URL (e.g. `https://xxxx.supabase.co`) | Yes |
| `VITE_SUPABASE_ANON_KEY` | Supabase anonymous/public key | Yes |
| `VITE_GEMINI_API_KEY` | Google Gemini API key | Yes |
| `VITE_STATUS_API_BASE` | Base URL for an external status API | Optional |
| `VITE_INTERNAL_API_KEY` | API key sent as `X-API-KEY` header to the status API | Optional |

> **Note on Supabase credentials:** `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are required for the app to connect to Supabase. If they are not set, the client is initialized with empty strings and logs a console error: `[Bahati] VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set. Copy .env.example to .env.local and fill in your Supabase project credentials.` There are no built-in fallback credentials — the app will not connect to Supabase until valid values are configured.

> **Security note:** The Supabase service role key (`SUPABASE_KEY`) grants admin-level database access and **must never be placed in frontend code or any `VITE_` variable**. Keep it only in server-side/backend environments.

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
VITE_GEMINI_API_KEY=your_gemini_api_key_here
VITE_STATUS_API_BASE=http://localhost:5000
VITE_INTERNAL_API_KEY=your_internal_api_key_here
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
-- scripts/disable_force_password_change.sql
UPDATE public.profiles SET must_change_password = FALSE;
```

This script is also saved at `scripts/disable_force_password_change.sql` for reference.

## Security

See [docs/SECURITY_OPERATIONS.md](docs/SECURITY_OPERATIONS.md) for:

- Credential rotation steps
- Removing sensitive files from Git history
- Setting environment variables in CI/CD

---

## Deployment Checklist — Stages 1 through 8.1

Use this checklist when deploying a release that includes any changes from
stages 1 through 8.1.  Run each step in order.

### Pre-deploy

- [ ] Run `npm run build` locally — confirm zero TypeScript errors.
- [ ] Run `npm run test:coverage` — confirm all tests pass and coverage does
      not regress.
- [ ] Confirm all required migrations are present in `supabase/migrations/`
      (see table below).
- [ ] Confirm `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and
      `VITE_GEMINI_API_KEY` are set in the deployment platform (Vercel /
      Firebase).
- [ ] Check [status.supabase.com](https://status.supabase.com) — no active
      incidents.

### Migration verification

| Stage | Migration file | Key objects created |
|-------|---------------|---------------------|
| 1/2 | `20260322073000_calculate_finance_v2.sql` | `calculate_finance_v2()` function |
| 2   | `20260322090000_submit_collection_v2.sql` | `submit_collection_v2()` function |
| 6   | `20260322150000_fleet_queue_snapshots.sql` | `queue_health_reports` table |
| 8   | `20260322200000_health_alerts.sql` | `health_alerts` table, `generate_health_alerts()` function |
| 8.1 | `20260322200001_health_alerts_harden.sql` | RLS hardening, index improvements |

Confirm each migration is applied:

```sql
SELECT version, name, executed_at
FROM supabase_migrations.schema_migrations
ORDER BY executed_at DESC
LIMIT 10;
```

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
