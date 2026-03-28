<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/19ZXHne5Pl7SQ2J0RPJvTJi1lf01A0cU6

## 🚀 Supabase 数据库配置 / Supabase setup

---

### 第一步 / Step 1 — 打开 SQL Editor / Open SQL Editor

打开 Supabase Dashboard，选择你的项目，点击左侧 **SQL Editor**。

Open your Supabase Dashboard, select your project, click **SQL Editor** in the left sidebar.

---

### 第二步 / Step 2 — 选择你的数据库配置路径 / Choose your database setup path

`supabase/migrations/` 中包含**两类文件**，不要全部按顺序运行——请根据你的场景选择一条路径：

The `supabase/migrations/` directory contains **two distinct types of files**. Do not run all of them blindly in order — choose one path based on your scenario:

---

#### 路径 A：最小生产基线（仅核心登录 + 司机 + 点位）
**Path A — Minimal production baseline (identity, driver, location only)**

适用场景：全新生产项目，只需要登录、司机管理和点位分配功能。

Use when: brand-new production project, only need login identity, driver records, and location assignment.

在 SQL Editor 中运行此单一文件：

Run this single file in SQL Editor:
```
supabase/migrations/20260325123000_production_v1_minimal_baseline.sql
```

详情见 `docs/PRODUCTION_V1_MINIMAL_SETUP.md`。

See `docs/PRODUCTION_V1_MINIMAL_SETUP.md` for details.

---

#### 路径 B：完整生产基线（含收款、结算、支持、诊断）
**Path B — Full production baseline (all features)**

适用场景：需要完整业务功能（收款、财务、支持工单、诊断）的生产部署。

Use when: production deployment that needs the full business scope (collection, finance, support cases, diagnostics).

按顺序运行以下四个文件：

Apply these four files in order:
```
supabase/migrations/20260325130000_production_full_00_identity_and_assignment.sql
supabase/migrations/20260325133000_production_full_01_business_flow.sql
supabase/migrations/20260325140000_production_full_02_support_and_audit.sql
supabase/migrations/20260325150000_production_full_03_diagnostics_and_health.sql
```

详情见 `docs/PRODUCTION_FULL_BASELINE_APPROACH.md`。

See `docs/PRODUCTION_FULL_BASELINE_APPROACH.md` for details.

---

#### 路径 C：对已有数据库做增量更新
**Path C — Incremental update to an existing database**

适用场景：数据库已运行，只需补充新的 migration 文件。

Use when: the database is already running and you only need to apply new incremental changes.

> ⚠️ 只运行你尚未应用的那些 migration 文件，不要重新运行已有的文件。  
> ⚠️ Apply only the specific migration files you have not yet applied. Do not re-run files already applied.

> ⚠️ **不要**将 `20240101000000_initial_schema.sql` 或 `20240103000000_enable_rls.sql` 与上面的生产基线包混用——两者会产生冲突的 RLS 策略。  
> ⚠️ Do **not** mix `20240101000000_initial_schema.sql` / `20240103000000_enable_rls.sql` with the production baseline packs above — they produce conflicting RLS policies.

---

### 第三步 / Step 3 — 创建或绑定账号 / Create or bind accounts

通过以下方式创建用户账号：

1. 通过 Supabase Dashboard → **Authentication → Users** 手动创建用户，再补齐 `public.profiles` / `public.drivers` 绑定。
2. 使用 Edge Function `create-driver` 创建司机账号。
3. 管理员账号在 Supabase Auth 中手动创建，然后在 `public.profiles` 中插入对应的 `role = 'admin'` 记录。

To create accounts:

1. Create users manually in Supabase Dashboard → **Authentication → Users**, then insert the matching `public.profiles` / `public.drivers` rows.
2. Use the `create-driver` Edge Function to create driver accounts.
3. Admin accounts are created manually in Supabase Auth, then a matching `role = 'admin'` row is inserted into `public.profiles`.

---

### 常见问题 / Troubleshooting

**问题：登录报错 `Account exists but profile is not provisioned`**

在 SQL Editor 中手动插入对应的 `public.profiles` 绑定记录。

**问题：忘记密码 / Forgot password**

在 Supabase Dashboard → **Authentication → Users** 中选择用户 → **Send password reset** 或直接修改密码。

---

### 两个 APP 的区别 / What are the two apps?

| | 管理员 APP (Admin) | 司机 APP (Driver) |
|---|---|---|
| **登录账号** | 任意 `public.profiles.role = 'admin'` 的账号 | 任意 `public.profiles.role = 'driver'` 且已绑定 `driver_id` 的账号 |
| **功能** | 查看所有点位、所有交易、管理司机、结账审批 | 收款、提交交易、查看自己的路线 |
| **语言** | 中文 | Swahili |

两个 APP 是**同一个网址**，登录后系统根据账号角色自动跳转到对应界面。

Both apps are **the same URL** — the system automatically routes to the admin or driver interface based on the account role after login.

---

## Edge Function: Create Driver Account

The `create-driver` Supabase Edge Function lets an admin create a complete driver account in a single API call — no manual Dashboard clicks or SQL required.

### What it does

1. Creates a Supabase Auth user (email + password, email pre-confirmed so the driver can log in immediately).
2. Inserts or updates the matching row in `public.drivers`.
3. Inserts or updates the matching row in `public.profiles` (`role='driver'`, `driver_id`, `display_name`).

### Security

- **Admin-only**: the caller must supply a valid JWT from an authenticated admin session.
- Uses the `service_role` key internally so RLS policies do not block any writes.

### Request

```http
POST /functions/v1/create-driver
Authorization: Bearer <admin-jwt>
Content-Type: application/json
```

Required fields:
- `email`
- `password`
- `driver_id`

Optional fields:
- `display_name`
- `username`

### Deploy

```bash
supabase functions deploy create-driver --no-verify-jwt
```

> `--no-verify-jwt` is safe here because the function performs its own JWT validation and admin role check internally.

---

## Run Locally

**Prerequisites:** Node.js

1. Install dependencies:
   `npm install`
2. Copy `.env.example` to `.env.local` and fill in your Supabase and Gemini API credentials:
   ```bash
   cp .env.example .env.local
   ```
3. Run the app:
   `npm run dev`

---

## Repository quality gates

Repository-level changes are expected to pass these checks:

1. `npm run test:ci`
2. `npm run typecheck`
3. `npm run build`

### Local vs CI test modes

- `npm test` keeps the current local-friendly behavior and still allows zero tests during ad hoc development.
- `npm run test:ci` is the strict mode used by repository CI and **must fail** if no tests are found.
