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
| `VITE_SUPABASE_URL` | Your Supabase project URL (e.g. `https://xxxx.supabase.co`) | Recommended (falls back to built-in project credentials) |
| `VITE_SUPABASE_ANON_KEY` | Supabase anonymous/public key | Recommended (falls back to built-in project credentials) |
| `VITE_GEMINI_API_KEY` | Google Gemini API key | Yes |
| `VITE_STATUS_API_BASE` | Base URL for an external status API | Optional |
| `VITE_INTERNAL_API_KEY` | API key sent as `X-API-KEY` header to the status API | Optional |

> **Note on Supabase credentials:** If `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` are not set, the app falls back to built-in project credentials and logs a console warning: `[Bahati] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY not set — using built-in project credentials`. Always set these env vars in production deployments to point at your own project.

> **Security note:** The Supabase service role key (`SUPABASE_KEY`) grants admin-level database access and **must never be placed in frontend code or any `VITE_` variable**. Keep it only in server-side/backend environments.

## Vercel Setup

1. Open your project in the [Vercel dashboard](https://vercel.com/dashboard).
2. Go to **Settings → Environment Variables**.
3. Add each variable from the table above with the appropriate value for each environment (Production, Preview, Development).
4. Redeploy the project after saving the variables.

> **Troubleshooting:** If the app connects to the wrong Supabase project, check the browser console for the warning `[Bahati] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY not set — using built-in project credentials`. This means the env vars are not reaching the build and the app is using its defaults.

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
