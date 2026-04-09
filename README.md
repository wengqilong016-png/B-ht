<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Bahati Jackpots

路线收款管理系统 — A progressive web app for managing slot-machine collection routes in Tanzania.

两个角色，一个网址 / Two roles, one URL — the app routes automatically to the Admin or Driver interface based on the signed-in account's role.

| | 管理员 (Admin) | 司机 (Driver) |
|---|---|---|
| **账号** | `public.profiles.role = 'admin'` | `public.profiles.role = 'driver'` + `driver_id` |
| **语言** | 中文 | Swahili |
| **主要功能** | 点位管理、交易总览、司机管理、结账审批 | 收款、提交交易、查看自己的路线 |

---

## Architecture overview

```
App.tsx  →  AuthContext / DataContext / MutationContext
              ↓
           hooks/  (useAuthBootstrap, useSupabaseData, useSupabaseMutations, …)
              ↓
           services/  (collectionSubmissionOrchestrator, financeCalculator, …)
              ↓
           repositories/  (locationRepository, driverRepository, transactionRepository, …)
              ↓
           Supabase (Auth + RLS + Realtime + Edge Functions)
```

**Key directories**

| Path | Purpose |
|------|---------|
| `admin/` | Admin shell, pages, and view config |
| `driver/` | Driver shell, pages, components, and hooks |
| `shared/` | Cross-role shell utilities (`AppRouterShell`, `SyncStatusPill`, …) |
| `components/` | Shared UI components (`Login`, `LiveMap`, `TransactionHistory`, …) |
| `contexts/` | React context providers (Auth, Data, Mutation, Toast, Confirm, Notification) |
| `hooks/` | Data-fetching and auth hooks |
| `services/` | Business-logic services (collection submit, finance, realtime, translate, …) |
| `repositories/` | Supabase query helpers (one file per domain entity) |
| `utils/` | Pure utility helpers (date, image, location workflow, settlement rules, …) |
| `types/` | Shared TypeScript types, enums, constants, and utility functions |
| `i18n/` | Translation maps — `zh.ts` (Chinese) and `sw.ts` (Swahili) |
| `api/` | Vercel edge-function proxies (`scan-meter`, `translate`) |

**Offline-first:** writes are queued in IndexedDB (`offlineQueue.ts`) with `isSynced: false` and flushed when connectivity is restored.

**Mobile:** the app is packaged for Android and iOS with Capacitor (`capacitor.config.ts`). Android builds follow the CI-standard toolchain of Java 21 + Node.js 22; see [`docs/MOBILE_BUILD_GUIDE.md`](docs/MOBILE_BUILD_GUIDE.md) for local signing and push-configuration steps.

---

## 🚀 Supabase 数据库配置 / Database setup

### 全新部署 / Fresh deployment

`supabase/schema.sql` is a convenience snapshot of the full schema. You may run it in **Supabase Dashboard → SQL Editor** to bootstrap a blank project quickly — it is idempotent (safe to re-run).

> **Source of truth:** the incremental migration files in `supabase/migrations/` are the authoritative schema history. Always apply new changes there.

---

### 增量更新 / Incremental updates

Apply only the migration files you have **not yet applied**, in chronological order:

```
supabase/migrations/
```

> ⚠️ 只运行你尚未应用的文件，不要重复运行。  
> ⚠️ Apply only files you have not yet applied. Do not re-run already-applied files.

---

### 创建账号 / Creating accounts

1. **司机账号 (Driver):** use the `create-driver` Edge Function (see below) or the Admin Console in the app UI.
2. **管理员账号 (Admin):** create the user in Supabase Dashboard → **Authentication → Users**, then insert a matching `public.profiles` row with `role = 'admin'`.

**Troubleshooting — `Account exists but profile is not provisioned`:** manually insert the missing `public.profiles` row in SQL Editor.

---

## Edge Functions

### `create-driver` — Provision a driver account

Creates a Supabase Auth user and the matching `public.drivers` + `public.profiles` rows in a single call.

```http
POST /functions/v1/create-driver
Authorization: Bearer <admin-jwt>
Content-Type: application/json

{ "email": "...", "password": "...", "driver_id": "D-XXXX", "display_name": "..." }
```

**Required:** `email`, `password`, `driver_id`. **Optional:** `display_name`, `username`.

### `delete-driver` — Remove a driver account

Deletes the Supabase Auth user and the associated `public.drivers` / `public.profiles` rows.

```http
POST /functions/v1/delete-driver
Authorization: Bearer <admin-jwt>
Content-Type: application/json

{ "driver_id": "D-XXXX" }
```

### Deploy both functions

```bash
supabase functions deploy create-driver --no-verify-jwt
supabase functions deploy delete-driver --no-verify-jwt
```

> `--no-verify-jwt` is intentional — each function performs its own JWT validation and admin-role check internally.

---

## Environment variables

Copy `.env.example` to `.env.local` and fill in the values:

| Variable | Required | Purpose |
|----------|----------|---------|
| `VITE_SUPABASE_URL` | ✅ | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | ✅ | Supabase `anon` public key |
| `OPENAI_API_KEY` | Recommended | Server-side OpenAI key used by Vercel API routes such as `api/admin-ai` and `api/scan-meter` |
| `GEMINI_API_KEY` | Recommended | Server-side Gemini key used by Vercel API routes such as `api/scan-meter` |
| `GOOGLE_TRANSLATE_API_KEY` | Recommended | Server-side Google Translate key used by `api/translate` |
| `STATUS_API_BASE` | Optional | Server-side status proxy base URL (currently unused) |
| `INTERNAL_API_KEY` | Optional | Server-side internal key for the status proxy (currently unused) |
| `VITE_DISABLE_AUTH` | Optional | Local/test-only auth bypass flag; production builds ignore `true` and stay authenticated |
| `VITE_VERCEL_ANALYTICS_ENABLED` | Optional | Set `true` only when Vercel Web Analytics is enabled for this project |

> Only `VITE_*` variables are exposed to the browser bundle. Do **not** store secrets such as AI keys, service-role keys, or internal API keys in `VITE_*` variables.
---

## 本地开发（安装 / 启动 / 测试 / 构建）

### 1) 安装 / Install

**Prerequisites:** Node.js 22+, npm 10+

```bash
npm ci
cp .env.example .env.local
```

Then fill real values in `.env.local` (at minimum: `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`).

### 2) 启动 / Start

```bash
npm run dev
```

Vite default URL:

```text
http://localhost:3000
```

### 3) 测试 / Test

Most common commands:

```bash
npm run test:ci            # Jest CI mode
npm run test:coverage:ci   # Jest + coverage
npm run test:e2e           # Playwright e2e
```

Quality checks:

```bash
npm run typecheck
npm run lint
npm run security:audit
```

One-command verifier (recommended):

```bash
./scripts/verify.sh             # quick: lint + test:ci + build
./scripts/verify.sh --full      # quick + security:audit
./scripts/verify.sh --full --android
```

`npm test` (without `:ci`) is the local-friendly alias that allows zero tests during ad hoc development.

Coverage enforcement targets the repository's **core unit-testable code surface**: services, reusable hooks, utilities, repositories, shared types, `offlineQueue.ts`, `supabaseClient.ts`, and `i18n/index.ts`. The current gate is **80% lines/statements** on that core surface. Heavier integration-oriented modules (for example AI-heavy hooks, Supabase data/mutation hooks, offline sync loop, and GPS capture runtime hooks) are still exercised via targeted tests and CI, but are not yet part of the unit coverage threshold.

### 4) 构建 / Build

Web production build:

```bash
npm run build
npm run preview
```

Android debug/release build:

```bash
npm run cap:build:android
npm run cap:build:android:release
```

## CI / merge gate

- `.github/workflows/ci.yml` runs **typecheck, lint, security audit, coverage-tested Jest, Playwright E2E, and production build** on pushes and pull requests to `main`.
- GitHub Code Scanning default setup runs CodeQL analysis for JavaScript/TypeScript.
- `.github/dependabot.yml` keeps npm and GitHub Actions dependencies up to date.
- SonarCloud is an optional next-step for technical-debt tracking. Enable it only after provisioning a real SonarCloud organization, project key, and `SONAR_TOKEN` secret so CI does not gain a permanently failing placeholder workflow.

To make these checks mandatory before merge, configure **Branch protection** for `main` in GitHub:

1. Require a pull request before merging.
2. Require status checks to pass before merging.
3. Select the CI checks you want enforced once the workflows have run at least once.
4. Optionally require branches to be up to date before merging.

---

## Documentation

| File | Contents |
|------|---------|
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | Local setup, quality commands, branch-protection checklist, and PR expectations |
| [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) | Environment variables, Vercel setup, Supabase migration deployment |
| [`docs/RUNBOOK.md`](docs/RUNBOOK.md) | Operator & support procedures (daily ops, offline replay, fleet diagnostics) |
| [`docs/MOBILE_BUILD_GUIDE.md`](docs/MOBILE_BUILD_GUIDE.md) | Android APK and iOS build steps via Capacitor |
| [`docs/SECURITY_OPERATIONS.md`](docs/SECURITY_OPERATIONS.md) | Credential rotation, secret management, RLS notes |
| [`docs/DATA_MODEL_AUDIT.md`](docs/DATA_MODEL_AUDIT.md) | Database schema and table reference |
| [`driver/README.md`](driver/README.md) | Driver sub-module architecture and performance notes |
