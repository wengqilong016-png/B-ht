<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/19ZXHne5Pl7SQ2J0RPJvTJi1lf01A0cU6

## Supabase Database Setup

Before running the app, you must create the required tables in your Supabase project.

**Tables required:**

| Table | Purpose |
|---|---|
| `locations` | Machine / store point-of-sale locations |
| `drivers` | Driver accounts and debt information |
| `transactions` | Revenue collection and expense records |
| `daily_settlements` | End-of-day cash reconciliation records |
| `ai_logs` | AI audit query and response history |
| `notifications` | System notifications |

**How to create the tables:**

1. Open your [Supabase dashboard](https://supabase.com/dashboard) and select your project.
2. Go to **SQL Editor** in the left sidebar.
3. Copy the entire contents of [`setup_db.sql`](./setup_db.sql) and paste it into the editor.
4. Click **Run** to execute the script.

The script will create all required tables with the correct columns, indexes, and permissions.

> **Note:** The script starts with `DROP TABLE IF EXISTS … CASCADE` statements to allow clean re-runs. Do **not** run it against a production database that already has data you want to keep.

---

## 修复 profiles 表（一键重建账号绑定）

如果你执行了 `setup_db.sql` 或 `fix_rls_safe.sql` 导致 `public.profiles` 表被清空/重建，
所有用户登录时会看到 **"Account exists but profile is not provisioned / 账号存在但未配置"** 的报错。

使用以下任意一种方法自动修复：

### 方法 A：SQL Migration（推荐，最快）

在 Supabase Dashboard → **SQL Editor** 中执行：

```sql
-- 文件路径: supabase/migrations/20260312000000_repair_profiles.sql
-- 也可以直接复制粘贴文件内容到 SQL Editor 运行
```

或者直接在 SQL Editor 中粘贴下面的核心逻辑（同文件内容）：

```sql
DO $$
DECLARE
  r           RECORD;
  v_driver    RECORD;
  v_email_pfx TEXT;
  v_role      TEXT;
  v_driver_id TEXT;
  v_display   TEXT;
BEGIN
  FOR r IN
    SELECT id, email, raw_user_meta_data FROM auth.users WHERE deleted_at IS NULL
  LOOP
    v_email_pfx := split_part(r.email, '@', 1);
    SELECT id, name INTO v_driver FROM public.drivers
      WHERE lower(username) = lower(v_email_pfx);
    IF FOUND THEN
      v_role := 'driver'; v_driver_id := v_driver.id; v_display := v_driver.name;
    ELSE
      v_role := 'admin'; v_driver_id := NULL;
      v_display := COALESCE(
        r.raw_user_meta_data->>'display_name',
        r.raw_user_meta_data->>'full_name',
        v_email_pfx
      );
    END IF;
    INSERT INTO public.profiles (auth_user_id, role, display_name, driver_id)
    VALUES (r.id, v_role, v_display, v_driver_id)
    ON CONFLICT (auth_user_id) DO NOTHING;
  END LOOP;
END $$;
```

脚本会：
- 遍历所有 `auth.users`（已软删除的跳过）
- 对每个用户，若 email 前缀匹配 `drivers.username` → 绑定 `driver` 角色
- 否则默认绑定 `admin` 角色
- 已存在的 profiles 行不覆盖（幂等，可重复执行）

### 方法 B：Node.js 脚本（适合批量/自动化）

```bash
# 1. 准备环境变量（使用 service_role key，不要提交到版本库！）
export SUPABASE_URL="https://<project-ref>.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="eyJ..."   # 在 Supabase Dashboard → Settings → API 中获取

# 2. 安装依赖（已有则跳过）
npm ci

# 3. 预览将要执行的操作（不写入数据库）
node scripts/repair_profiles.js --dry-run

# 4. 确认无误后正式执行
node scripts/repair_profiles.js

# 5. 若需要强制覆盖已有的 profiles 行
node scripts/repair_profiles.js --overwrite
```

### 手动修复单个账号（SQL）

```sql
-- 查询用户 UUID
SELECT id, email FROM auth.users WHERE email = '你的邮箱@example.com';

-- 写入管理员 profile
INSERT INTO public.profiles (auth_user_id, role, display_name, driver_id)
VALUES ('<上面查到的uuid>', 'admin', 'Admin', NULL)
ON CONFLICT (auth_user_id) DO UPDATE
  SET role = 'admin', display_name = 'Admin', driver_id = NULL;

-- 写入司机 profile（将 uuid 和 driver_id 替换为实际值）
INSERT INTO public.profiles (auth_user_id, role, display_name, driver_id)
VALUES ('<uuid>', 'driver', 'Sudi', 'D-SUDI')
ON CONFLICT (auth_user_id) DO UPDATE
  SET role = 'driver', display_name = 'Sudi', driver_id = 'D-SUDI';
```

### ⚠️ 修复后的安全步骤

1. **立即修改默认密码** — 所有账号（尤其是 `admin@bahati.com`）的默认密码极弱，请在 Supabase Dashboard → Authentication → Users 中强制重置，或通知各用户自行修改。
2. **验证 RLS 已启用** — 在 SQL Editor 中运行 `SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname='public';`，确认所有业务表的 `rowsecurity = true`。
3. **不要在生产环境直接使用 `setup_db.sql`** — 该文件包含 `DROP TABLE … CASCADE`，每次运行都会清空所有数据和 profiles。如需升级数据库结构，请只运行文件末尾的"增量迁移"部分。

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
