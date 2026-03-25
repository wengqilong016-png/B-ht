<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/19ZXHne5Pl7SQ2J0RPJvTJi1lf01A0cU6

## 🚀 Supabase 数据库配置（先区分“首次初始化”与“增量更新”）/ Supabase setup (bootstrap vs incremental)

---

### 第 0 步 / Step 0 — 先判断你的场景 / Decide your scenario first

**仅在以下场景运行 `BAHATI_COMPLETE_SETUP.sql`：**
- 全新项目第一次初始化
- 本地一次性重建
- 可丢弃的测试环境

**以下场景不要运行 `BAHATI_COMPLETE_SETUP.sql`：**
- 已有真实数据的环境
- 任何需要保留现有表和数据的 Supabase 项目
- 只想做一次小改动、补一个约束、补一个索引、补一个函数的情况

> ⚠️ `BAHATI_COMPLETE_SETUP.sql` 是 **destructive bootstrap script**：它会先 drop 再重建表，并按该 SQL 文件当前版本中定义的账号/默认密码进行 seed。  
> ⚠️ For any existing database, **do not run `BAHATI_COMPLETE_SETUP.sql`** — apply only the targeted migration files instead.  
> ⚠️ 对已有数据库做增量更新时，请只运行 `supabase/migrations/` 里的目标 migration。  
> ⚠️ 在任何共享环境执行 bootstrap SQL 之前，先阅读 `docs/SECURITY_OPERATIONS.md`。

---

### 第一步 / Step 1 — 打开 SQL Editor / Open SQL Editor

打开 Supabase Dashboard，选择你的项目，点击左侧 **SQL Editor**。

Open your Supabase Dashboard, select your project, click **SQL Editor** in the left sidebar.

---

### 第二步 / Step 2 — 仅在首次初始化时运行完整脚本 / Run the full script only for bootstrap

把 [`BAHATI_COMPLETE_SETUP.sql`](./BAHATI_COMPLETE_SETUP.sql) 的**全部内容**复制粘贴进去，点击 **Run**。

Copy the **entire contents** of [`BAHATI_COMPLETE_SETUP.sql`](./BAHATI_COMPLETE_SETUP.sql), paste it into the editor, click **Run**.

> ⚠️ **此脚本会先删除再重建所有表！如有数据请先备份。**  
> ⚠️ **This script drops and recreates all tables. Back up any existing data first.**
>
> ⚠️ **该脚本还会 seed 它内部当前定义的账号与默认密码。运行前必须先审查 SQL 内容。**  
> ⚠️ **The script also seeds whatever accounts and password defaults are currently defined inside the SQL file. Review it before running.**

---

### 第三步 / Step 3 — 创建或绑定账号 / Create or bind accounts

如果你刚刚运行的是 bootstrap SQL，那么它会根据 **该次执行的 `BAHATI_COMPLETE_SETUP.sql` 内容** 创建/重置账号与 profiles 绑定关系。执行前先审查账号列表；执行后立即轮换默认密码。

If you just ran the bootstrap SQL, it will create/reset accounts and profile bindings according to the **exact contents of `BAHATI_COMPLETE_SETUP.sql` at the time you run it**. Review the account list before execution, and rotate all default passwords immediately afterwards.

如果你使用的是**已有数据库**，不要重跑完整 bootstrap。请改用下面两种方式之一：

For an **existing database**, do not rerun the full bootstrap. Use one of these instead:

1. 通过 Supabase Dashboard → **Authentication → Users** 手动创建用户，再补齐 `public.profiles` / `public.drivers` 绑定。
2. 使用 Edge Function `create-driver` 创建司机账号。

---

### Seed account safety / 种子账号安全说明

- 不要把 README 里的示例邮箱当作真实 source of truth。**真正的 source of truth 是你准备执行的 SQL 文件本身。**
- 当前仓库快照中的 bootstrap SQL 可能包含环境相关账号；执行前必须人工确认。
- 任何默认密码都只能用于一次性初始化；首次登录后必须立即修改。
- 生产环境不要保留弱密码，也不要长期保留 seed 账号的默认凭证。

---

### 常见问题 / Troubleshooting

**问题：登录报错 `Account exists but profile is not provisioned`**

在 SQL Editor 中执行 `BAHATI_COMPLETE_SETUP.sql`，或者单独运行对应的 profiles 补齐 SQL。

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
