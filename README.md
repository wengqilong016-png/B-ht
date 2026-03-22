<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/19ZXHne5Pl7SQ2J0RPJvTJi1lf01A0cU6

## 🚀 Supabase 数据库配置（3步完成）/ Supabase Setup (3 steps)

---

### 第一步 / Step 1 — 打开 SQL Editor / Open SQL Editor

打开 [Supabase Dashboard](https://supabase.com/dashboard)，选择你的项目，点击左侧 **SQL Editor**。

Open your [Supabase Dashboard](https://supabase.com/dashboard), select your project, click **SQL Editor** in the left sidebar.

---

### 第二步 / Step 2 — 复制粘贴并运行 / Copy, paste and run

把 [`BAHATI_COMPLETE_SETUP.sql`](./BAHATI_COMPLETE_SETUP.sql) 的**全部内容**复制粘贴进去，点击 **Run**。

Copy the **entire contents** of [`BAHATI_COMPLETE_SETUP.sql`](./BAHATI_COMPLETE_SETUP.sql), paste it into the editor, click **Run**.

> ⚠️ **此脚本会先删除再重建所有表！如有数据请先备份。**
> ⚠️ **This script drops and recreates all tables. Back up any existing data first.**

---

### 第三步 / Step 3 — 创建测试账号 / Create test accounts

数据库建好后，通过 Supabase Dashboard → **Authentication → Users** 手动创建用户，或使用 Edge Function `create-driver` 创建司机账号。

After the database is set up, create users manually via Supabase Dashboard → **Authentication → Users**, or use the `create-driver` Edge Function to create driver accounts.

> ⚠️ **不要在生产环境使用弱密码。所有账号都必须使用强密码。**
> ⚠️ **Do not use weak passwords in production. All accounts must use strong passwords.**

#### 本地开发测试账号 / Local Development Test Accounts

仅用于本地开发环境。运行 `BAHATI_COMPLETE_SETUP.sql` 后会自动创建以下测试用户。**切勿将这些账号用于生产部署。**

These accounts are for local development only. They are created automatically when you run `BAHATI_COMPLETE_SETUP.sql`. **Never use these accounts for production deployments.**

| 角色 Role | 邮箱 Email |
|---|---|
| 管理员 Admin | `admin@bahati.com` |
| 司机 Driver 1 | `feilong@bahati.com` |
| 司机 Driver 2 | `q@bahati.com` |
| 司机 Driver 3 | `sudi@bahati.com` |
| 司机 Driver 4 | `w@bahati.com` |

> 💡 默认密码在 SQL seed 脚本中定义，请在登录后立即修改。
> 💡 Default passwords are defined in the SQL seed script — change them immediately after first login.

---

### 常见问题 / Troubleshooting

**问题：登录报错 "Account exists but profile is not provisioned"**

在 SQL Editor 中执行 `BAHATI_COMPLETE_SETUP.sql`，或者单独运行：

```sql
DO $$
DECLARE r RECORD; v_driver RECORD; v_email_pfx TEXT; v_role TEXT; v_driver_id TEXT; v_display TEXT;
BEGIN
  FOR r IN SELECT id, email, raw_user_meta_data FROM auth.users WHERE deleted_at IS NULL LOOP
    v_email_pfx := split_part(r.email, '@', 1);
    SELECT id, name INTO v_driver FROM public.drivers WHERE lower(username) = lower(v_email_pfx);
    IF FOUND THEN v_role := 'driver'; v_driver_id := v_driver.id; v_display := v_driver.name;
    ELSE v_role := 'admin'; v_driver_id := NULL;
      v_display := COALESCE(r.raw_user_meta_data->>'display_name', r.raw_user_meta_data->>'full_name', v_email_pfx);
    END IF;
    INSERT INTO public.profiles (auth_user_id, role, display_name, driver_id)
    VALUES (r.id, v_role, v_display, v_driver_id)
    ON CONFLICT (auth_user_id) DO NOTHING;
  END LOOP;
END $$;
```

**问题：忘记密码 / Forgot password**

在 Supabase Dashboard → **Authentication → Users** 中选择用户 → **Send password reset** 或直接修改密码。

---

### 两个 APP 的区别 / What are the two apps?

| | 管理员 APP (Admin) | 司机 APP (Driver) |
|---|---|---|
| **登录账号** | `admin@bahati.com` | `feilong@bahati.com` 等 |
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

- **Admin-only**: the caller must supply a valid JWT (from an authenticated admin session). The function looks up the caller's `public.profiles.role` and rejects the request if it is not `'admin'`.
- Uses the `service_role` key internally so RLS policies do not block any writes.

### Request

```
POST https://<project-ref>.supabase.co/functions/v1/create-driver
Authorization: Bearer <admin-jwt>
Content-Type: application/json
```

| Field | Type | Required | Description |
|---|---|---|---|
| `email` | string | ✅ | New driver's login email |
| `password` | string | ✅ | Initial password (minimum 6 characters) |
| `driver_id` | string | ✅ | `drivers.id` to bind (e.g. `D-SUDI`) |
| `display_name` | string | — | Human-readable name; defaults to `driver_id` |
| `username` | string | — | Username; defaults to `driver_id.toLowerCase()` |

### Response

**201 Created (success)**
```json
{
  "success": true,
  "auth_user_id": "uuid",
  "email": "sudi@bahati.com",
  "driver_id": "D-SUDI",
  "display_name": "Sudi",
  "username": "sudi"
}
```

**409 Conflict (duplicate email or driver_id)**
```json
{
  "success": false,
  "error": "Conflict: driver_id already bound to another auth user",
  "code": "DRIVER_ID_CONFLICT",
  "driver_id": "D-SUDI"
}
```

**403 Forbidden (caller is not admin)**
```json
{ "success": false, "error": "Forbidden: admin access required" }
```

### Deploy

```bash
supabase functions deploy create-driver --no-verify-jwt
```

> `--no-verify-jwt` is safe here because the function performs its own JWT validation and admin role check internally.

### Example call (curl)

```bash
curl -X POST https://<project-ref>.supabase.co/functions/v1/create-driver \
  -H "Authorization: Bearer <ADMIN_JWT>" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "sudi@bahati.com",
    "password": "StrongPass123",
    "driver_id": "D-SUDI",
    "display_name": "Sudi",
    "username": "sudi"
  }'
```

### Schema mapping

| Function parameter | Auth table | `public.drivers` column | `public.profiles` column |
|---|---|---|---|
| `email` | `auth.users.email` | — | — |
| `password` | `auth.users` (hashed) | — | — |
| `driver_id` | — | `id` (TEXT PK) | `driver_id` |
| `display_name` | — | `name` | `display_name` |
| `username` | — | `username` | — |
| *(generated)* | `auth.users.id` | — | `auth_user_id` |

---

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Copy `.env.example` to `.env.local` and fill in your Supabase and Gemini API credentials:
   ```bash
   cp .env.example .env.local
   ```
3. Run the app:
   `npm run dev`
