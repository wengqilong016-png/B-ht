# Production Full Baseline Approach

## Goal

Keep the existing functional scope, but move it into a **coherent production setup**.

This means:
- existing tables can stay
- existing workflows can stay
- but setup must no longer depend on one giant destructive bootstrap script
- production auth provisioning must be separated from schema setup
- RLS must be consistent with one normalized profile contract

---

## Core principle

The problem is **not** that there are too many tables.
The problem is that the current setup path is not coherent enough for production.

A coherent production setup should be split into layers.

### Layer 1 — identity and assignment
These must come first because every other permission model depends on them.

Tables:
- `profiles`
- `drivers`
- `locations`

Purpose:
- who can log in
- who is admin vs driver
- which driver is bound to which locations

### Layer 2 — business flow
After identity is stable, bring in the business tables.

Tables:
- `transactions`
- `daily_settlements`
- `location_change_requests`

Purpose:
- collection and finance history
- settlement flow
- location change approval workflow

### Layer 3 — operational support
After the business flow is stable, bring in the support / audit / operational tables.

Tables:
- `support_cases`
- `support_audit_log`
- `notifications`
- `ai_logs`

Purpose:
- support workflow
- audit trail
- operator notifications
- AI interaction history

### Layer 4 — diagnostics and health
This is optional for the first production cut if the system is already too complex.

Bring in only after the rest is stable:
- queue / fleet diagnostics
- health alerts
- related cron / monitoring pieces

---

## Recommended production setup model

Instead of one giant setup SQL, production should use one **ordered baseline pack**:

1. `00_identity_and_assignment.sql`
2. `01_business_flow.sql`
3. `02_support_and_audit.sql`
4. `03_diagnostics_and_health.sql`
5. `04_rls_and_permissions.sql`
6. `05_post_setup_checks.sql`

This is still coherent and runnable, but it is not the same as the legacy destructive bootstrap.

### Why this is better

- easier to review
- easier to fix one layer without breaking all others
- easier to test RLS after the schema exists
- no need to mix real auth-user creation into schema setup

---

## What should stay out of the baseline

These should not be part of the long-term production baseline pack:
- real production email seeds
- shared default passwords
- destructive drop-and-recreate logic
- mixing schema creation and real-user provisioning in the same SQL file

---

## Recommended normalized contract

### `profiles`
Use one contract everywhere:
- `auth_user_id` is the canonical identity key
- `role` is the app role
- `driver_id` is the optional business binding for drivers

All admin checks and support-case policies must reference the same contract.

### Auth provisioning
Production auth users should be created only by:
- manual Supabase Auth creation
- or admin-only provisioning flow

Schema setup should not create real production auth users.

---

## Practical recommendation for your project

If you want the existing functional scope to remain, the best production path is:

### Phase A — normalize the identity layer first
Do this before any larger SQL repack:
- finalize the `profiles` contract
- rewrite admin checks to use that contract consistently
- make `drivers`, `profiles`, and `locations` the first stable production layer

### Phase B — bring business tables in as the second layer
Once identity is stable, bring back:
- `transactions`
- `daily_settlements`
- `location_change_requests`

### Phase C — bring support / audit back as the third layer
Only after the first two layers are stable:
- `support_cases`
- `support_audit_log`
- `notifications`
- `ai_logs`

### Phase D — diagnostics last
Only after the rest is stable:
- fleet diagnostics
- health alerts
- monitoring-specific tables and jobs

---

## What this means for you right now

Your software can keep the existing tables and features.
But production should not be:
- one giant bootstrap
- one SQL that seeds real users
- one mixed setup path that creates schema + RLS + real auth accounts together

Production should be:
- one coherent baseline pack
- one normalized identity contract
- one documented auth provisioning path
- one consistent RLS layer applied after schema layers are defined

---

## Best next implementation task

The next implementation task should be:

**write the identity-layer normalization spec and then generate the first coherent production baseline pack from it**

That pack should start with:
- `profiles`
- `drivers`
- `locations`
- normalized helper functions
- normalized RLS for admin and driver roles

Then the rest of the existing tables can be brought in layer by layer without losing continuity.
