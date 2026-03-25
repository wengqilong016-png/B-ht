# Production Baseline V2 Inventory Template

Use this document in the next phase to inventory the current Supabase baseline before rewriting schema and policies.

---

## 1. Core tables

For each table, mark one status:
- keep
- rewrite
- split
- remove from bootstrap

| Table | Purpose | Current source | Status | Notes |
|---|---|---|---|---|
| `locations` | | | | |
| `drivers` | | | | |
| `profiles` | | | | |
| `transactions` | | | | |
| `daily_settlements` | | | | |
| `ai_logs` | | | | |
| `notifications` | | | | |
| `location_change_requests` | | | | |

---

## 2. Helper functions

| Function | Purpose | Keep / rewrite / remove | Notes |
|---|---|---|---|
| `get_my_role()` | | | |
| `get_my_driver_id()` | | | |
| `is_admin()` | | | |
| `clear_my_must_change_password()` | | | |
| `apply_location_change_request(...)` | | | |

---

## 3. Triggers and trigger functions

| Trigger / function | Table | Purpose | Keep / rewrite / remove | Notes |
|---|---|---|---|---|
| `on_transaction_anomaly()` | `transactions` | | | |
| `on_machine_overflow()` | `locations` | | | |
| `on_reset_locked()` | `locations` | | | |

---

## 4. Auth provisioning paths

| Path | Current behavior | Keep / replace | Notes |
|---|---|---|---|
| Bootstrap SQL seeded auth users | | | |
| Manual Supabase dashboard provisioning | | | |
| `create-driver` Edge Function | | | |
| Profile binding / repair SQL | | | |

---

## 5. RLS inventory

For each table, document:
- admin read
- admin write
- driver read
- driver write
- broad authenticated read exists?
- production posture decision

| Table | Admin read/write | Driver read/write | Broad authenticated access | Decision | Notes |
|---|---|---|---|---|---|
| `locations` | | | | | |
| `drivers` | | | | | |
| `profiles` | | | | | |
| `transactions` | | | | | |
| `daily_settlements` | | | | | |
| `ai_logs` | | | | | |
| `notifications` | | | | | |
| `location_change_requests` | | | | | |

---

## 6. Bootstrap contents to remove from long-term production path

Mark any content that should no longer remain in the long-term production setup path:
- real production email addresses in committed SQL
- shared default passwords
- destructive drop-and-recreate workflow
- mixed schema + auth + RLS + trigger logic in one file

| Item | Present now? | Remove from production path? | Notes |
|---|---|---|---|
| Real email seeds | | | |
| Shared default password | | | |
| Destructive drop/recreate | | | |
| All-in-one SQL baseline | | | |

---

## 7. Repository cleanup targets

| Current file / area | Problem | Target location | Phase |
|---|---|---|---|
| Root governance tests | | `tests/repo/` | 5 |
| Legacy bootstrap SQL | | `supabase/bootstrap/` or legacy area | 3/5 |
| Production docs | | `docs/` | 1 |
| Database setup docs | | `docs/` | 1/3 |

---

## 8. Cutover readiness checklist

Before the actual production baseline cutover, confirm:
- backup exists
- migration order reviewed
- RLS reviewed table by table
- auth provisioning path decided
- no seeded production passwords remain in committed SQL
- rollback notes exist
