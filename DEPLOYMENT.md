# Deployment Guide

This document describes how to configure environment variables for deploying this Vite + React app on Vercel (or locally).

## Required Environment Variables

All frontend variables **must** be prefixed with `VITE_` so that Vite exposes them to the browser bundle via `import.meta.env`.

| Variable | Description | Required |
|---|---|---|
| `VITE_SUPABASE_URL` | Your Supabase project URL (e.g. `https://xxxx.supabase.co`) | Yes |
| `VITE_SUPABASE_ANON_KEY` | Supabase anonymous/public key | Yes |
| `VITE_GEMINI_API_KEY` | Google Gemini API key | Yes |
| `VITE_STATUS_API_BASE` | Base URL for the status API (e.g. `https://your-status-api.example.com`) | Optional |
| `VITE_INTERNAL_API_KEY` | API key sent as `X-API-KEY` header to the status API | Optional |
| `SUPABASE_URL` | Your Supabase project URL for the backend status API (`status_api.py`) | Yes (backend) |
| `SUPABASE_KEY` | Supabase service role key for the backend status API (`status_api.py`) | Yes (backend) |

> **Security note:** `SUPABASE_KEY` (service role key) grants admin-level access to your database and **must never be placed in frontend code or any `VITE_` variable**. Keep it only in server-side/backend environments.

## Vercel Setup

1. Open your project in the [Vercel dashboard](https://vercel.com/dashboard).
2. Go to **Settings → Environment Variables**.
3. Add each variable from the table above with the appropriate value for each environment (Production, Preview, Development).
4. Redeploy the project after saving the variables.

> **If you see a white screen after deployment**, the most common cause is missing `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`. Check the browser console for a `[Bahati] Supabase is not configured` warning. A second common cause is a stale service-worker cache – the service worker has been updated to always fetch fresh HTML, so a hard-refresh (`Ctrl+Shift+R`) or clearing site data will resolve it on existing installs.

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
npm install
npm run dev
```

> `.env.local` is listed in `.gitignore` and will not be committed to the repository.
