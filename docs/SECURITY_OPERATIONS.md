# Security Operations Guide

This document covers operational security steps that **cannot** be automated by code — they require manual action in dashboards or on a local machine.

---

## Immediate Incident Checklist: `BAHATI_DATA_BACKUP.json`

Use this checklist when the committed backup file or any similar operational dump has been exposed through Git history.

### What was exposed in this incident

- Real operational data for about 107 locations.
- Owner / machine photos embedded as base64 blobs.
- Plain-text `password` fields inside the exported dataset.
- Phone numbers and business metadata.

During the April 8, 2026 local cleanup, the file was removed from all reachable local Git refs and the local object database was pruned. That only fixes the **local clone**. You must still complete the remote-side actions below.

### Required follow-up after local cleanup

1. Force-push the rewritten history to `origin/main` and any rewritten remote branches.
2. Tell every collaborator to delete old clones, re-clone, and avoid re-pushing pre-rewrite branches.
3. If the repository was public or shared broadly, open a GitHub support ticket asking for cached object / PR diff purge for the removed blob.
4. Rotate every user password that appeared in the backup export.
5. Revoke stale access for former collaborators, devices, CI tokens, and dashboard users who no longer need production visibility.
6. Verify `VITE_DISABLE_AUTH` is `false` in all deployed environments.

---

## 0. Database changes

All database changes should be applied via `supabase/schema.sql` (fresh deployment) or versioned migration files in `supabase/migrations/` (incremental update). Do not run ad hoc destructive SQL scripts against any environment that contains real data.

### Setup paths

**New environment — run this single file:**
```
supabase/schema.sql
```
This file contains all tables, functions, triggers and RLS policies and is idempotent.

**Existing environment (incremental update):**
Apply only the migration files you have not yet applied from `supabase/migrations/`. Do not re-run already-applied files.

## 1. Credential Rotation and Account Reset

### When is this required?

- The Supabase `anon` key (or project URL) was ever hard-coded into a committed file **and that commit is in Git history**.
- A former team member who should no longer have access has seen the credentials.
- You suspect the key has been leaked.
- Seeded bootstrap passwords or account lists were exposed to people who should not retain access.
- An operational export (such as `BAHATI_DATA_BACKUP.json`) exposed real user passwords or account metadata.

### Steps

1. Log in to Supabase and open the production project.
2. Go to **Settings → API**.
3. Regenerate the `anon` key if it was exposed outside the intended browser bundle.
4. Regenerate the `service_role` key immediately if it was ever committed, pasted into chat, stored in a tracked file, or shared outside the core operators.
5. Rotate every application password that appeared in the leaked backup dataset.
6. In **Authentication → Users**, force password resets or manually set new passwords for all affected users.
7. Revoke old sessions for affected users so old devices must sign in again.
8. Update every deployment that uses the old key:
   - **Vercel**: update `VITE_SUPABASE_ANON_KEY`, plus any server-side AI / internal API secrets that were also rotated.
   - **GitHub Actions**: update `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `VERCEL_TOKEN`, and any rotated AI / internal API secrets.
   - **Local `.env.local`**: update all developer machines.
9. Verify the old keys and old user passwords no longer work.

> ℹ️ The Supabase `anon` key is designed to be safe in client-side code when Row-Level Security (RLS) is enabled on all tables. However, if the key has been publicly exposed and RLS was not enabled at the time, treat it as compromised.

---

## 2. Removing `BAHATI_DATA_BACKUP.json` from Git History

The file `BAHATI_DATA_BACKUP.json` (≈ 15.8 MB, contains real operational data) was committed to the repository. Simply deleting it and adding it to `.gitignore` removes it from the working tree but **the file remains in every historic commit**.

### Why this matters

- Anyone who clones the repository — including with `--depth=1` — can still access the full contents of any file present in the history if they fetch the specific blob SHA.
- Hosting services (GitHub) cache objects indefinitely until a force-push or contact-support cache purge is performed.

### Recommended tool: BFG Repo Cleaner

BFG Repo Cleaner is faster and safer than `git filter-branch`.

```bash
# 1. Download BFG (requires Java)
wget https://repo1.maven.org/maven2/com/madgag/bfg/1.14.0/bfg-1.14.0.jar -O bfg.jar

# 2. Clone a fresh, bare mirror of the repo (replace with your repo URL)
git clone --mirror https://github.com/your-org/your-repo.git

# 3. Run BFG to delete the specific file from ALL history
java -jar bfg.jar --delete-files BAHATI_DATA_BACKUP.json your-repo.git

# 4. Expire old refs and repack
cd your-repo.git
git reflog expire --expire=now --all
git gc --prune=now --aggressive

# 5. Force-push all refs (this rewrites public history — coordinate with all team members!)
git push --force
```

> ⚠️ **Coordinate with all collaborators before force-pushing.** Everyone must re-clone or rebase their local branches after the force-push.

### Alternative: `git filter-repo`

```bash
pip install git-filter-repo
git filter-repo --path BAHATI_DATA_BACKUP.json --invert-paths
git push --force
```

### Local verification commands

After rewriting history and pruning old refs, all of the following should return no results:

```bash
git log --all --stat -- BAHATI_DATA_BACKUP.json
git rev-list --objects --all | grep 'BAHATI_DATA_BACKUP.json'
git for-each-ref --format='%(refname)' refs/original/
```

If any command still prints the filename, old refs or objects are still keeping the blob alive.

---

## 3. Setting Environment Variables in Vercel

1. Open Vercel and select your project.
2. Go to **Settings → Environment Variables**.
3. Add each variable below for the **Production**, **Preview**, and **Development** environments as appropriate:

| Variable | Required | Description |
|---|---|---|
| `VITE_SUPABASE_URL` | Yes | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Yes | Supabase anonymous/public key |
| `OPENAI_API_KEY` | Optional | Server-side OpenAI key used by `api/admin-ai` and `api/scan-meter` |
| `GEMINI_API_KEY` | Yes, if AI scan is enabled | Server-side Gemini API key |
| `GOOGLE_TRANSLATE_API_KEY` | Optional | Server-side Google Translate API key |
| `STATUS_API_BASE` | Optional | Server-side base URL for the status API |
| `INTERNAL_API_KEY` | Optional | Server-side API key for the internal status API |
| `VITE_DISABLE_AUTH` | Must be `false` outside local / test | Prevents auth-free driver mode from being enabled in deployed environments |

4. Click **Save** and then **Redeploy** to apply the new variables.

> ⛔ Never put the `service_role` key in a `VITE_` variable — it would be bundled into the JavaScript that anyone can download.

---

## 4. GitHub Actions and CI Secret Rotation

This repository currently uses GitHub Actions for build / deploy automation. Store secrets in **Repository Settings → Secrets and variables → Actions** and rotate them after any security incident involving source history, dashboards, or compromised developer devices.

1. Open the repository → **Settings → Secrets and variables → Actions**.
2. Review and rotate the following secrets as applicable:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `SUPABASE_ACCESS_TOKEN`
   - `SUPABASE_DB_PASSWORD`
   - `SUPABASE_PROJECT_ID`
   - `VERCEL_TOKEN`
   - `VERCEL_ORG_ID`
   - `VERCEL_PROJECT_ID`
   - `OPENAI_API_KEY`
   - `GEMINI_API_KEY`
   - `GOOGLE_TRANSLATE_API_KEY` (if used)
   - `STATUS_API_BASE` (if used)
   - `INTERNAL_API_KEY` (if used)
3. Re-run production deploy workflows only after the new secrets are saved.
4. Remove any obsolete secrets that are no longer referenced by workflows.

### Local development

```bash
cp .env.example .env.local
# Edit .env.local and fill in your values
```

`.env.local` is gitignored and will never be committed.

---

## 5. Verifying No Secrets Are in the Current Working Tree

Run the following to confirm no untracked credential files exist:

```bash
# Check for any .env files that might be committed
git ls-files | grep -E '\.env'

# Check for service-role keys in tracked source files
git grep -i 'service_role' -- '*.ts' '*.tsx' '*.js' '*.cjs'

# Check for potential credential patterns
git grep -E '[a-zA-Z0-9]{40,}' -- 'supabaseClient.ts' 'get_credentials.cjs'
```

If any secrets appear in tracked files, rotate them immediately (see Section 1) and consider using a tool like truffleHog or gitleaks for a full scan.

---

## 6. Access Containment

After a leak, do not stop at key rotation. Reduce who can still reach production data.

1. Audit GitHub repository collaborators and remove anyone who no longer needs access.
2. Review Vercel project members and environment-variable access.
3. Review Supabase organization / project members and remove stale accounts.
4. Revoke old Supabase personal access tokens (`sbp_...`) used by CI after replacing them.
5. Ensure production and preview deployments do not set `VITE_DISABLE_AUTH=true`.
6. Ask collaborators to delete pre-cleanup local clones, zip exports, chat attachments, and downloaded backups.
7. Treat any machine or admin account listed in the leaked backup as compromised until its password has been reset.
