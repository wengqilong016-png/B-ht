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
