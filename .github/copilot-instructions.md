# Copilot Instructions for Bahati Jackpots

## Project overview

Bahati Jackpots is a React 19 + TypeScript progressive web app for managing slot-machine collection routes in Tanzania.

- Admin flows are primarily in Chinese (`zh`)
- Driver flows are primarily in Swahili (`sw`)
- Shared UI text lives in `TRANSLATIONS` in `types.ts`
- All translations are also mirrored in `i18n/zh.ts` and `i18n/sw.ts`

## Tech stack

- Vite 6
- React 19
- TypeScript
- Tailwind CSS via `styles.css` + PostCSS (`tailwind.config.js`, `postcss.config.js`)
- Supabase for persistence (Auth + RLS + Realtime + Edge Functions)
- Leaflet + `react-leaflet` for maps
- Gemini via `@google/genai`
- Offline queue support in `offlineQueue.ts` (IndexedDB with localStorage fallback)
- Capacitor for Android/iOS packaging

## Directory structure

```
App.tsx                    # Root component — auth gate, context providers, role router
types.ts                   # Shared interfaces, constants, TRANSLATIONS, utility helpers
offlineQueue.ts            # IndexedDB/localStorage offline transaction queue
supabaseClient.ts          # Supabase client singleton and health check

contexts/                  # React context providers
  AuthContext.tsx           #   currentUser, userRole, lang, setLang, handleLogout
  DataContext.tsx           #   isOnline, locations, drivers, transactions, filteredData
  MutationContext.tsx       #   syncOfflineData, updateDrivers, updateLocations, …

hooks/
  useAuthBootstrap.ts      # Auth state machine — session restore, login, logout
  useSupabaseData.ts       # Role-scoped Supabase selects, online detection
  useSupabaseMutations.ts  # Upsert/delete helpers wrapping Supabase
  useOfflineSyncLoop.ts    # Reconnect-triggered offline queue flush
  useRealtimeSubscription.ts  # Supabase Realtime channel subscriptions
  useDevicePerformance.ts  # Low-power device detection
  useCollectionSubmission.ts  # Collection submit orchestration hook
  useSyncStatus.ts         # Unsynced count and sync status pill state

services/
  authService.ts           # fetchCurrentUserProfile, restoreCurrentUserFromSession, signOut
  collectionSubmissionOrchestrator.ts  # End-to-end submit flow orchestration
  collectionSubmissionService.ts       # submit_collection_v2 RPC call
  financeCalculator.ts     # calculate_finance_v2 RPC call
  fleetDiagnosticsService.ts  # Fleet queue health aggregation
  diagnosticsExportService.ts  # Local and fleet export payloads
  healthAlertService.ts    # Health alert fetch and upsert
  supportCaseService.ts    # Support case CRUD and audit trail
  localDB.ts               # localDB read/write helpers
  translateService.ts      # Translation key lookup

utils/
  authMode.ts              # isAuthDisabled(), local driver picker helpers
  passwordPolicy.ts        # Password strength validation
  imageUtils.ts            # Image resize utilities
  timeout.ts               # Promise timeout wrapper
  transactionBuilder.ts    # Transaction object construction helpers

admin/                     # Admin shell, pages, and components
driver/                    # Driver shell, pages, and components
shared/                    # AppRouterShell, SyncStatusPill, ShellLoadingFallback
components/                # Shared UI components (Login, LiveMap, ForcePasswordChange, …)
i18n/                      # zh.ts, sw.ts translation maps
supabase/migrations/       # All incremental database migrations (source of truth)
```

## Important files

- `App.tsx` — root auth gate; delegates to `useAuthBootstrap`, `useSupabaseData`, `useSupabaseMutations`, `useOfflineSyncLoop`, `useRealtimeSubscription`; wraps everything in `AuthProvider` / `DataProvider` / `MutationProvider`
- `types.ts` — shared interfaces, constants, `TRANSLATIONS`, `safeRandomUUID()`, `resizeImage()`
- `offlineQueue.ts` — IndexedDB queue with localStorage fallback; `enqueueTransaction`, `flushQueue`, `replayDeadLetterItem`
- `supabaseClient.ts` — Supabase client and `checkSupabaseHealth()`
- `supabase/migrations/` — database schema, RLS, helpers, triggers (incremental; **do not re-run** `BAHATI_COMPLETE_SETUP.sql` against real data)
- `components/LiveMap.tsx` — Leaflet map UI
- `components/ForcePasswordChange.tsx` — Shown when `currentUser.mustChangePassword` is true
- `services/supportCaseService.ts` — Support case CRUD, audit trail, `normalizeCaseId()`

## Validation commands

```bash
npm ci                  # Install dependencies
npm run typecheck       # TypeScript type check (must pass before merging)
npm run build           # Vite production build
npm run test            # Jest unit tests — permissive (passWithNoTests)
npm run test:ci         # Jest unit tests — strict CI mode (no passWithNoTests)
npm run test:coverage   # Jest with coverage report
```

> **CI gate:** `npm run typecheck` and `npm run test:ci` must both pass.  
> The repository has **338 unit tests** under `__tests__/` (Jest + ts-jest, jsdom environment).  
> Tests import `describe`/`it`/`expect`/`jest` from `@jest/globals`, not from injected globals.

## Repository conventions

- Prefer small, surgical TypeScript changes
- Extend shared types in `types.ts` instead of redefining inline shapes
- Keep admin strings in `zh` and driver strings in `sw` inside `TRANSLATIONS`
- Use `safeRandomUUID()` from `types.ts` instead of `crypto.randomUUID()`
- Follow the offline-first pattern: save locally with `isSynced: false`, then mark records synced after Supabase upserts succeed
- Driver collection flows filter locations by `assignedDriverId`; fall back gracefully when no locations are assigned
- Reuse `resizeImage()` from `types.ts` instead of duplicating image-processing logic
- Use `normalizeCaseId()` from `services/supportCaseService.ts` whenever accepting a `caseId` at a service boundary
- App contexts (`AuthContext`, `DataContext`, `MutationContext`) export strongly-typed value interfaces; prefer these over `any` in component props
- Database changes go into a new file under `supabase/migrations/` — never into `BAHATI_COMPLETE_SETUP.sql`

## Auth and role routing

- `useAuthBootstrap` manages the auth state machine (initialize → restore session → login/logout)
- `isAuthDisabled()` from `utils/authMode.ts` enables the local driver picker for offline-only mode
- After login, `currentUser.mustChangePassword === true` triggers `ForcePasswordChange` before the main shell
- `AppRouterShell` routes `role === 'admin'` → `AppAdminShell`, otherwise → `AppDriverShell`

## Supabase and RLS

- RLS policies scope `transactions` and `daily_settlements` by role: admin sees all, driver sees only their own rows via `get_my_role()` / `get_my_driver_id()` helper functions
- High-frequency writes (collection submit, finance calculation) go through Supabase RPCs (`submit_collection_v2`, `calculate_finance_v2`), not direct table upserts
- Never put `service_role` key in frontend code — use `anon` key only
- Edge Function `create-driver` handles admin-authenticated driver provisioning

## Frontend and deployment notes

- `index.tsx` imports `styles.css`; do not switch Tailwind back to a CDN setup
- Vite uses `base: './'` in `vite.config.ts`; keep asset paths relative for root and subpath deployments
- The app registers `sw.js` for PWA/offline behavior; changes to caching or sync must preserve service-worker compatibility
- Environment variables are injected via Vite (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`); never hard-code credentials

## Maps and location behavior

- Machine locations use `Location.coords`
- Driver heartbeat GPS is updated via the sync loop
- Submitted collections store GPS on `Transaction.gps`
- Map features use Leaflet with custom `L.divIcon` markers
