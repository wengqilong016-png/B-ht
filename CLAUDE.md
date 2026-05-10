# BAHATI JACKPOTS (BHT) — Claude Code Context

## Project
- React 19 + TypeScript + Tailwind 4 + Supabase + Vite
- Offline-first PWA for slot machine revenue management in Tanzania
- 3 drivers + 1 admin. Drivers collect machine scores, admin manages fleet.

## Architecture
```
driver/          — Driver mobile app (QuickCollect, CollectionFlow, GPS)
components/      — Admin dashboard (DriverManagement, SitesTab, Dashboard)
services/        — Business logic (financeCalculator, collection, evidence)
hooks/           — React Query hooks (useSupabaseData, useSupabaseMutations)
repositories/    — Supabase data access layer
offlineQueue.ts  — IndexedDB queue + sync loop
supabase/        — Migrations, Edge Functions, schema
```

## Key Rules (from AGENTS.md)
- Read max 3 files initially, expand only with justification
- No scanning entire repo without reason
- Fix root cause, not symptoms. No comment-out "fixes"
- After changes: run full test suite → commit → push
- Tests: `npx jest --no-coverage --passWithNoTests`
- Push migrations: `SUPABASE_ACCESS_TOKEN=$(grep SUPABASE_ACCESS_TOKEN supabase/.env|cut -d= -f2) npx supabase db push`

## Critical Files
- `offlineQueue.ts` (1625 lines) — offline queue, IDB, flush, retry, dead-letter
- `hooks/useSupabaseMutations.ts` (720 lines) — all React Query mutations
- `hooks/useSupabaseData.ts` — data queries + isOnline health check
- `services/financeCalculator.ts` — local + server finance calculation
- `services/collectionSubmissionOrchestrator.ts` — submit pipeline
- `services/driverManagementService.ts` — Edge Function wrappers
- `components/driver-management/DriverManagementPage.tsx` — admin driver CRUD
- `driver/components/QuickCollect.tsx` — fast collection entry

## Deep Trace Docs
Loaded from `docs/` directory:
- `docs/offline-queue-sync-trace.md` — IDB schema, enqueue/flush/markSynced
- `docs/collection-submit-trace.md` — QuickCollect→submit_collection_v2 SQL
- `docs/admin-crud-trace.md` — admin CRUD + optimistic updates + cascade
- `docs/realtime-gps-evidence-trace.md` — Realtime, GPS, evidence photos
- `docs/finance-trace.md` — finance formulas, settlement, dividend, payout

## Pitfalls
- `supabase.functions.invoke` has NO default timeout → use Promise.race
- `isOnline` defaults to `false` on cold start → 5-10s offline false-positive
- React Query `setQueriesData` with prefix matches ALL scopes
- SECURITY DEFINER functions must set `search_path = public, pg_temp`
- ON CONFLICT DO NOTHING can silently drop duplicates
- Node via x-cmd: `. ~/.x-cmd.root/X` before any npm command
- Android/Termux: use @rolldown/binding-linux-arm64-gnu, not android-arm64
