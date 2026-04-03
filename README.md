<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/19ZXHne5Pl7SQ2J0RPJvTJi1lf01A0cU6

## 🚀 Supabase 数据库配置 / Supabase setup

---

### 全新部署 / Fresh deployment

打开 Supabase Dashboard → **SQL Editor**，将以下**单一文件**全部内容粘贴并运行：

Open Supabase Dashboard → **SQL Editor**, paste and run this **single file**:

```
supabase/schema.sql
```

该文件包含所有表、函数、触发器和 RLS 策略，幂等（可重复执行）。

This file contains all tables, functions, triggers and RLS policies. It is idempotent (safe to re-run).

---

### 对已有数据库做增量更新 / Incremental update to an existing database

适用场景：数据库已运行，只需补充新的 migration 文件。

Use when: the database is already running and you only need to apply new changes.

`supabase/migrations/` 按时间顺序包含以下文件（依次应用）：

```
20260325130000_production_full_00_identity_and_assignment.sql
20260325133000_production_full_01_business_flow.sql
20260325140000_production_full_02_support_and_audit.sql
20260325150000_production_full_03_diagnostics_and_health.sql
20260325155000_calculate_finance_v2.sql
20260325156000_submit_collection_v2.sql
20260327000000_stage16_fix_driver_flows.sql
20260328000000_harden_automation_triggers.sql
20260328000001_realtime_broadcast_triggers.sql
```

> ⚠️ 只运行你尚未应用的文件，不要重复运行。  
> ⚠️ Apply only files you have not yet applied. Do not re-run already-applied files.

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

## Edge Function: Create Admin Account

The `create-admin` Supabase Edge Function lets an existing admin create a new administrator account in a single API call — no manual Supabase Dashboard clicks or SQL required.

Administrator accounts can also be created directly through the **Admin Console → 管理员 (Admins)** page in the app UI.

### What it does

1. Creates a Supabase Auth user (email + password, email pre-confirmed so the new admin can log in immediately).
2. Inserts a record in `public.profiles` (`role='admin'`, `driver_id: null`, `display_name`).
3. Rolls back the Auth user automatically if the profile insert fails (no orphaned accounts).

### Security

- **Admin-only**: the caller must supply a valid JWT from an authenticated admin session.
- Uses the `service_role` key internally so RLS policies do not block any writes.

### Request

```http
POST /functions/v1/create-admin
Authorization: Bearer <admin-jwt>
Content-Type: application/json
```

Required fields:
- `email`
- `password` (minimum 8 characters)

Optional fields:
- `display_name` (defaults to `'Admin'`)

### Deploy

```bash
supabase functions deploy create-admin --no-verify-jwt
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
