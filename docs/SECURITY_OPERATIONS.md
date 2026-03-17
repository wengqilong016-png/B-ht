# Security Operations Guide — Bahati Jackpots

This document covers **operational security** steps that are outside the normal development
workflow: credential rotation, Git-history cleaning, and environment-variable management.

---

## 1. Supabase Credential Rotation

If a Supabase URL or `anon` / `service_role` key has **ever** appeared in the Git history
(e.g. hard-coded in `supabaseClient.ts`, utility scripts, or any committed file), you must
treat those credentials as **compromised** and rotate them immediately.

### Steps

1. Log in to [supabase.com](https://supabase.com) → your project → **Project Settings → API**.
2. Click **"Regenerate"** next to the relevant key (`anon` / `service_role`).
   - The old key is **invalidated immediately** after regeneration.
3. Update every place that uses the old key:
   - Vercel environment variables (see Section 3).
   - Any CI/CD secrets in GitHub → **Settings → Secrets and variables → Actions**.
   - Local `.env.local` files on all developer machines (never committed, but should be updated).
4. Redeploy the application so the new key takes effect.

> **Why**: Supabase `anon` keys are deliberately safe for browser exposure because Row-Level
> Security (RLS) limits what they can access. However, if RLS is misconfigured or a
> `service_role` key was exposed, rotation is non-negotiable.

---

## 2. Cleaning Sensitive Files from Git History

> ⚠️ This section describes steps that **must be performed manually** by a repository owner.
> They require a local clone, write access, and a force-push. They are **not executed by this PR**.

### 2.0 Immediate mitigation — remove from the current branch

Even before scheduling a history rewrite, remove the file from `HEAD` so that **fresh clones
stop pulling the 15.8 MB payload**:

```bash
# Run from a regular (non-mirror) clone
git rm --cached BAHATI_DATA_BACKUP.json
echo "BAHATI_DATA_BACKUP.json" >> .gitignore   # already ignored via *BACKUP* pattern
git commit -m "chore: remove BAHATI_DATA_BACKUP.json from working tree"
git push
```

> This commit alone does **not** erase the file from older commits — it only stops
> new clones from checking it out. The full history rewrite (Section 2.2) is still
> required to expunge the data entirely.

### 2.1 Why Git history cleaning is necessary

Adding a file to `.gitignore` only prevents **future** commits. If `BAHATI_DATA_BACKUP.json`
(15.8 MB) or any credential file is already in the commit history, anyone who has cloned the
repo can still access it via `git log` or the GitHub UI.

### 2.2 Immediate mitigation: remove file from current branch (HEAD)

Before performing a full history rewrite, immediately stop serving the file to **new clones**
by removing it from the current branch while keeping the local copy:

```bash
# From a normal (non-mirror) clone of the main repo
git rm --cached BAHATI_DATA_BACKUP.json
git commit -m "Remove BAHATI_DATA_BACKUP.json from tracked files"
git push
```

This ensures **future clones** of the default branch do not receive `BAHATI_DATA_BACKUP.json`,
but it does **not** remove the file from **past commits**. To fully clean the history, you
still need to follow the `git-filter-repo` steps below.

### 2.3 Recommended tool: `git-filter-repo`

`git-filter-repo` is the officially recommended replacement for `git filter-branch`.

```bash
# 1. Install (once)
pip install git-filter-repo

# 2. Work on a **fresh** clone to avoid accidental data loss
git clone --mirror https://github.com/wengqilong016-png/B-ht.git B-ht-clean.git
cd B-ht-clean.git

# 3. Remove the backup file from all history
git filter-repo --path BAHATI_DATA_BACKUP.json --invert-paths

# 4. Force-push all refs (branches + tags) back to origin
git push --force --mirror origin

# 5. Ask all collaborators to re-clone the repo
#    (their local clones contain the old history and cannot be rebased on top safely)
```

### 2.3 Alternative: BFG Repo-Cleaner

```bash
# Requires Java
bfg --delete-files BAHATI_DATA_BACKUP.json B-ht-clean.git
cd B-ht-clean.git
git reflog expire --expire=now --all && git gc --prune=now --aggressive
git push --force
```

### 2.4 After cleaning

- Contact GitHub Support to clear their cached CDN copies if the repo is public.
- Rotate any credentials that appeared in the removed files (see Section 1).
- Remind all contributors to delete their local clones and re-clone.

---

## 3. Setting Environment Variables in Vercel

1. Open [vercel.com](https://vercel.com) → your project → **Settings → Environment Variables**.
2. Add the variables below for **Production**, **Preview**, and **Development** environments:

   | Variable | Description |
   |---|---|
   | `VITE_SUPABASE_URL` | `https://<project-id>.supabase.co` |
   | `VITE_SUPABASE_ANON_KEY` | Supabase `anon` / public key |
   | `VITE_GEMINI_API_KEY` | Google Gemini API key |
   | `VITE_STATUS_API_BASE` | Base URL for the status API (optional) |
   | `VITE_INTERNAL_API_KEY` | `X-API-KEY` for the status API (optional) |

3. Trigger a new deployment after saving variables (**Deployments → Redeploy**).

> The `SUPABASE_KEY` (service role key) is **only** for server-side/backend use. It must
> **never** be set as a `VITE_*` variable — doing so would expose it in the browser bundle.

---

## 4. Setting Environment Variables in GitHub Actions

CI workflows that run `npm run build` need Supabase credentials at build time.

1. Go to your repository on GitHub → **Settings → Secrets and variables → Actions**.
2. Add the following **Repository secrets**:

   | Secret name | Value |
   |---|---|
   | `VITE_SUPABASE_URL` | Supabase project URL |
   | `VITE_SUPABASE_ANON_KEY` | Supabase anon key |
   | `VITE_GEMINI_API_KEY` | Gemini API key |

3. Reference them in workflow YAML:
   ```yaml
   env:
     VITE_SUPABASE_URL: ${{ secrets.VITE_SUPABASE_URL }}
     VITE_SUPABASE_ANON_KEY: ${{ secrets.VITE_SUPABASE_ANON_KEY }}
     VITE_GEMINI_API_KEY: ${{ secrets.VITE_GEMINI_API_KEY }}
   ```

---

## 5. Local Development Security Checklist

- [ ] Copy `.env.example` → `.env.local` (never `.env` directly, as some tools do not gitignore it).
- [ ] Never commit `.env.local`, `.env.production`, or any file with real credentials.
- [ ] Run `git status` before every commit to verify no secret files are staged.
- [ ] Use `git secrets` or `trufflehog` pre-commit hooks to scan for accidental key leaks.
- [ ] Rotate any key that is accidentally committed, even if you immediately revert the commit.

---

## 6. `.gitignore` Coverage (Reference)

The root `.gitignore` is configured to ignore:

- All `.env*` files **except** `.env.example`
- Common backup/export patterns: `*backup*`, `*BACKUP*`, `*.dump`, `*.sql.gz`, `*.sqlite`, `*.db`, `*.jsonl`, `*.ndjson`
- Build artefacts: `dist/`, `coverage/`, `supabase/.temp/`, `.firebase/`, `.vercel/`
- Alternative package-manager lock files: `pnpm-lock.yaml`, `yarn.lock`

This prevents future accidents but **does not remove** files already in history.
