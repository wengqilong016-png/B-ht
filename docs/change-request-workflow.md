# Location Change Request Workflow

This document explains how to set up and use the **driver → admin location-data change-request** feature in Bahati Jackpots.

---

## 1. Database Setup (run once in Supabase SQL Editor)

Open your Supabase project → **SQL Editor** → paste the contents of `sql/location_change_requests.sql` and click **Run**.

The script creates:
- **`public.location_change_requests`** table with proper indexes and RLS policies.
- **`public.is_admin()`** helper function (SECURITY DEFINER, safe `search_path`).
- **`public.apply_location_change_request(request_id, approve, note)`** RPC that applies or rejects a patch.

### Prerequisites
The following tables must already exist (created by `setup_db.sql` / Supabase migrations):
- `auth.users`
- `public.profiles` (columns: `auth_user_id uuid PK`, `role text`, `driver_id text`, …)
- `public.locations` (columns use **camelCase with double-quotes** in Postgres, e.g. `"machineId"`, `"ownerName"`)

### RLS Policies
| Role   | INSERT | SELECT | UPDATE |
|--------|--------|--------|--------|
| Driver | Own requests only | Own requests only | — |
| Admin  | — | All requests | All requests |

The `is_admin()` function checks `public.profiles.auth_user_id = auth.uid()` (not `user_id`).

---

## 2. How the Workflow Works

```
Driver                      Supabase DB                 Admin
  │                              │                         │
  │──[fill form + submit]──────► insert location_change_requests  │
  │                              │                         │
  │  (status = 'pending')        │◄───[fetch pending]──────│
  │                              │                         │
  │                              │◄──[approve/reject RPC]──│
  │                              │                         │
  │     (on approve)             │                         │
  │◄──────────────────── locations row updated (patch applied)   │
  │     (on reject)              │                         │
  │◄──────────────────── status = 'rejected', review_note set    │
```

### Driver side
1. Navigate to the **申请 / Maombi** tab in the driver view.
2. Select a location from the dropdown.
3. Tick the fields to change, enter new values.
4. Optionally add a reason, then tap **提交变更申请 / Submit Change Request**.
5. View past requests and their status in the collapsible history panel.

> **Offline behavior**: The form requires an active internet connection. If offline, a warning is shown and the submit button is disabled.

### Admin side
1. Navigate to **变更审核 / Change Req.** in the admin sidebar (or mobile tab).
2. Pending requests are listed at the top.
3. Expand a request to see the diff table (current value vs. proposed value).
4. Optionally add a review note, then tap **批准 / Approve** or **驳回 / Reject**.
5. On approval, the `apply_location_change_request` RPC updates the `locations` row directly.
6. Only fields explicitly present in the `patch` are updated; missing fields remain unchanged.

---

## 3. Environment Configuration

### Supabase Keys
Create a `.env.local` file at the repo root:

```bash
VITE_SUPABASE_URL=https://<your-project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<your-anon-key>
```

### Dev Fallback (opt-in only)
If you need to connect to the shared development database during local development, add:

```bash
VITE_ALLOW_DEV_FALLBACK=true
```

> ⚠️ This flag enables a hardcoded shared dev key. **Never set it in production or CI.** A red warning banner is displayed in the UI when this mode is active.

---

## 4. Allowed Patch Fields

The `apply_location_change_request` function only updates whitelisted fields:

| Field key | Type | Notes |
|-----------|------|-------|
| `name` | text | Location display name |
| `area` | text | District / area |
| `machineId` | text | Machine serial number |
| `ownerName` | text | Shop owner / contact name |
| `shopOwnerPhone` | text | Contact phone number |
| `ownerPhotoUrl` | text | URL of owner photo |
| `machinePhotoUrl` | text | URL of machine photo |
| `assignedDriverId` | text | Driver assignment |
| `commissionRate` | numeric | 0–1 decimal |
| `initialStartupDebt` | numeric | TZS |
| `remainingStartupDebt` | numeric | TZS |
| `isNewOffice` | boolean | |
| `lastRevenueDate` | text | ISO date string |
| `status` | text | `active` / `maintenance` / `broken` |
| `coords` | jsonb | `{ "lat": number, "lng": number }` |

Fields **not present** in the patch are left unchanged (no accidental NULLing).

---

## 5. Troubleshooting

| Problem | Fix |
|---------|-----|
| `permission denied for table profiles` in `is_admin()` | Ensure the function has `SECURITY DEFINER` and `SET search_path = public, auth` |
| `column "user_id" does not exist` | The correct column is `auth_user_id` – re-run the updated SQL script |
| Driver can see all requests | Check RLS policy `"Drivers can select their own requests"` is active |
| Patch not applied after approval | Verify `apply_location_change_request` uses double-quoted camelCase column names |
