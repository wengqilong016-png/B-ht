# Production Baseline V2 Inventory

This inventory is the Phase-2 working baseline for the productionization effort.

It is based on the repository-visible SQL sources currently checked into `main`:
- `BAHATI_COMPLETE_SETUP.sql`
- `supabase/migrations/20240101000000_initial_schema.sql`
- support-case and support-audit migrations through Stage 13

Goal:
- mark the current state clearly
- decide what to keep, rewrite, split, or remove from bootstrap
- identify the highest-risk production blockers before any live schema rewrite

---

## 1. Core tables

| Table | Purpose | Current source | Status | Notes |
|---|---|---|---|---|
| `locations` | machine / site master data | initial schema + legacy bootstrap | keep | Business shape is broadly valid; move to migration-first ownership and review driver update scope under RLS. |
| `drivers` | driver business records | initial schema + legacy bootstrap | keep | Keep as business table only; remove production auth-account seeding concerns from this layer. |
| `profiles` | auth user ↔ app role ↔ driver binding | initial schema + legacy bootstrap | rewrite | Core table should remain, but the contract must be normalized. Current schema uses `auth_user_id`, while later support migrations assume `profiles.id`, which is a schema mismatch that must be fixed before production baseline V2. |
| `transactions` | canonical collections and finance events | initial schema + legacy bootstrap | keep | Keep table responsibility; review write paths and long-term constraints under migration-first model. |
| `daily_settlements` | settlement / reconciliation records | initial schema + legacy bootstrap | keep | Keep table responsibility; review RLS and lifecycle semantics. |
| `ai_logs` | driver/admin AI query log | initial schema + legacy bootstrap | keep | Keep table, but review retention / access scope in production posture. |
| `notifications` | operator / driver notifications | initial schema + legacy bootstrap | rewrite | Table can stay, but delivery semantics and read scope should be reviewed. |
| `location_change_requests` | workflow for location changes | legacy bootstrap | keep | Useful workflow table; move into migration-first baseline and keep admin approval model. |
| `support_cases` | support case entity | stage-9 migration family | keep | Keep as support workflow table; bring under normalized profile/admin access contract. |
| `support_audit_log` | append-only support audit trail | stage-9 migration family | keep | Keep as append-only audit table; continue hardening relationship and access rules. |

### Immediate conclusion

The highest-risk schema issue currently visible in the repo is the **`profiles` contract mismatch**:
- initial schema / bootstrap define `profiles(auth_user_id ...)`
- support migrations check admin access via `profiles.id = auth.uid()`

This must be resolved early in V2 before further RLS cleanup, or support-case policies will remain structurally inconsistent.

---

## 2. Helper functions

| Function | Purpose | Keep / rewrite / remove | Notes |
|---|---|---|---|
| `get_my_role()` | return current user's app role | keep | Keep the concept; rewrite only if needed to match normalized `profiles` contract. |
| `get_my_driver_id()` | return current user's bound driver ID | keep | Keep the concept; same contract normalization note as above. |
| `is_admin()` | role check for admin-only logic | rewrite | Keep the function idea, but unify it with the final `profiles` schema contract used everywhere else. |
| `clear_my_must_change_password()` | clear first-login password-change flag | keep | Useful and security-aligned; keep under migration-first ownership. |
| `apply_location_change_request(...)` | admin approval / rejection workflow | keep | Keep; move out of legacy bootstrap and into dedicated migrations. |
| `resolve_support_case_v1(...)` | atomically close case + append audit event | keep | Good production direction; keep as transactional support workflow function. |

---

## 3. Triggers and trigger functions

| Trigger / function | Table | Purpose | Keep / rewrite / remove | Notes |
|---|---|---|---|---|
| `on_transaction_anomaly()` | `transactions` | create anomaly notification | keep | Keep business intent; later decide whether notification generation belongs in DB trigger or service/event layer. |
| `on_machine_overflow()` | `locations` | warn when score nears overflow | keep | Keep operational intent; move to migration-owned trigger set. |
| `on_reset_locked()` | `locations` | notify on reset lock | keep | Keep operational intent; move to migration-owned trigger set. |

### Trigger conclusion

None of the current triggers look like obvious delete candidates. The main change needed is **ownership and organization**, not feature removal.

---

## 4. Auth provisioning paths

| Path | Current behavior | Keep / replace | Notes |
|---|---|---|---|
| Legacy bootstrap SQL seeded auth users | creates or resets real auth users and shared default password from committed SQL | replace | Must not remain the long-term production path. Acceptable only as disposable rebuild helper. |
| Manual Supabase dashboard provisioning | documented path for creating users directly in Auth | keep | Valid production path. Needs checklist and profile-binding verification steps. |
| `create-driver` Edge Function (documented path) | admin-driven provisioning path for driver auth + driver/profile binding | keep | Good target production path, but should be validated against final schema contract in V2. |
| Profile binding / repair SQL | ad hoc repair when auth user exists but profile is missing | keep temporarily | Useful as transitional repair tooling; should not be the primary provisioning model. |

### Auth conclusion

The production baseline should converge on:
- `drivers` = business identity
- `profiles` = auth binding and role scope
- auth users created manually or through admin-only provisioning flow
- no committed production email seeds
- no shared committed production default password

---

## 5. RLS inventory

This section records the currently visible production posture from repo SQL.

| Table | Admin read/write | Driver read/write | Broad authenticated access | Decision | Notes |
|---|---|---|---|---|---|
| `locations` | full in legacy bootstrap | drivers can update assigned rows | yes, select is broad in legacy bootstrap | rewrite | Production posture should avoid broad all-authenticated read unless explicitly intended. |
| `drivers` | full in legacy bootstrap | driver can update own row; select currently broad | yes | rewrite | Salary / commission fields already show need for tighter production posture. |
| `profiles` | admin all, user self | self-read only | no | rewrite | Table shape and policy contract must be normalized first. |
| `transactions` | admin full | driver own rows | no | keep | Direction is mostly correct; verify no hidden broad access in other paths. |
| `daily_settlements` | admin full | driver own rows | no | keep | Direction is mostly correct. |
| `ai_logs` | admin full | driver own rows | no | keep | Direction is mostly correct, but retention and sensitivity review still needed. |
| `notifications` | admin full | driver own rows or null-target notifications | semi-broad | rewrite | Review how null-target notifications should work in production. |
| `location_change_requests` | admin update/select, requester insert/select | requester scoped | no | keep | Direction is good; keep workflow. |
| `support_cases` | intended admin-only | no driver path intended | no | rewrite | Current policy intent is good, but implementation references `profiles.id` instead of `auth_user_id`. |
| `support_audit_log` | intended admin select, authenticated insert | no driver-specific read path | insert broad to authenticated | rewrite | Append-only design is good; admin policy contract must be normalized and insert path should be reviewed after schema normalization. |

### RLS conclusion

The V2 rewrite should focus first on:
1. fixing `profiles` contract mismatch
2. removing broad authenticated read where it is not truly needed
3. re-checking support-case/admin policies after profile contract normalization

---

## 6. Bootstrap contents to remove from long-term production path

| Item | Present now? | Remove from production path? | Notes |
|---|---|---|---|
| Real email seeds | yes | yes | Current legacy bootstrap includes real email addresses. |
| Shared default password | yes | yes | Current legacy bootstrap includes a shared default password. |
| Destructive drop/recreate | yes | yes | Keep only for disposable rebuild helper path, not production path. |
| All-in-one SQL baseline | yes | yes | Must be split into migrations by concern. |

---

## 7. Repository cleanup targets

| Current file / area | Problem | Target location | Phase |
|---|---|---|---|
| Root governance tests | root is accumulating repo-governance tests | `tests/repo/` | 5 |
| `BAHATI_COMPLETE_SETUP.sql` | legacy bootstrap still sits as high-visibility setup file | `supabase/bootstrap/legacy/` or equivalent legacy area | 5 |
| Production planning docs | now correctly in docs, but not yet linked everywhere | `docs/` | 1/5 |
| Database setup guidance | still split between legacy README guidance and new production direction | `docs/` + README cleanup | 1/5 |

---

## 8. Cutover readiness checklist

Before implementing the actual V2 production baseline cutover, confirm:
- backup exists
- current live schema snapshot exists
- migration order reviewed
- `profiles` contract decision made
- support-case policy contract fixed on paper before SQL rewrite
- auth provisioning path chosen
- no new production email seeds are added to committed SQL
- no shared default production password remains in the future production path
- rollback notes exist

---

## 9. Recommended next implementation task

The next concrete implementation task should be:

**create a Supabase baseline normalization spec focused on `profiles`, admin checks, and support-case policy dependencies**

That task should answer:
- whether V2 keeps `auth_user_id` as the canonical key in `profiles`
- how all admin checks will reference `profiles`
- which support-case policies and functions must be updated once the contract is finalized

This is the smallest high-value next step before touching live schema logic.
