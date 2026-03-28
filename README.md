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

### 第二步 / Step 2 — 运行 migrations / Apply migrations

所有数据库变更均通过 `supabase/migrations/` 中的增量文件管理。按文件名顺序在 SQL Editor 中依次运行各 migration 文件。

All database changes are managed through incremental files in `supabase/migrations/`. Apply each migration file in filename order via the SQL Editor.

> ⚠️ 对已有数据库做增量更新时，请只运行 `supabase/migrations/` 里新增的目标 migration 文件。  
> ⚠️ For incremental updates to an existing database, apply only the new targeted migration files from `supabase/migrations/`.

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
