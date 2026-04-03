# Security Operations Guide

This document covers operational security steps that **cannot** be automated by code — they require manual action in dashboards or on a local machine.

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

## 1. Credential Rotation (Supabase URL / Anon Key)

### When is this required?

- The Supabase `anon` key (or project URL) was ever hard-coded into a committed file **and that commit is in Git history**.
- A former team member who should no longer have access has seen the credentials.
- You suspect the key has been leaked.
- Seeded bootstrap passwords or account lists were exposed to people who should not retain access.

### Steps

1. Log in to supabase.com and open your project.
2. Go to **Settings → API**.
3. Click **Regenerate** next to the `anon` public key (and/or the `service_role` key if it was exposed).
4. Update every deployment that uses the old key:
   - **Vercel**: Settings → Environment Variables → update `VITE_SUPABASE_ANON_KEY` and redeploy.
   - **Firebase Hosting**: update the secret in your CI secrets and redeploy.
   - **GitHub Actions secrets**: Settings → Secrets and variables → Actions → update `VITE_SUPABASE_ANON_KEY` and `VITE_SUPABASE_URL`.
   - **Local `.env.local`**: update all developer machines.
5. If bootstrap SQL seeded shared default passwords, rotate those passwords too in Supabase Auth.
6. Verify the old key no longer works by making a test API call with it.

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

---

## 3. Setting Environment Variables in Vercel

1. Open Vercel and select your project.
2. Go to **Settings → Environment Variables**.
3. Add each variable below for the **Production**, **Preview**, and **Development** environments as appropriate:

| Variable | Required | Description |
|---|---|---|
| `VITE_SUPABASE_URL` | Yes | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Yes | Supabase anonymous/public key |
| `VITE_GEMINI_API_KEY` | Yes | Google Gemini API key |
| `VITE_STATUS_API_BASE` | Optional | Base URL for the status API |
| `VITE_INTERNAL_API_KEY` | Optional | API key for the internal status API |

4. Click **Save** and then **Redeploy** to apply the new variables.

> ⛔ Never put the `service_role` key in a `VITE_` variable — it would be bundled into the JavaScript that anyone can download.

---

## 4. Setting Environment Variables in Firebase / GitHub Actions

### Firebase Hosting (via GitHub Actions)

All `VITE_*` variables are injected at build time through the GitHub Actions workflow (`.github/workflows/deploy.yml`). Store them as **GitHub repository secrets**:

1. Open the repository → **Settings → Secrets and variables → Actions**.
2. Add the following secrets:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_GEMINI_API_KEY`
   - `VITE_STATUS_API_BASE` (if used)
   - `VITE_INTERNAL_API_KEY` (if used)
   - `FIREBASE_SERVICE_ACCOUNT`
   - `FIREBASE_PROJECT_ID`

3. The workflow reads these secrets automatically via `${{ secrets.VAR_NAME }}`.

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
