# Production Baseline V2 Plan

## Status
Accepted as the productionization direction for the next database and repository cleanup cycle.

## Why this exists

The current repository can run, but it is not yet a clean long-term production baseline.

Current risks:
- `BAHATI_COMPLETE_SETUP.sql` is a destructive all-in-one bootstrap script.
- The legacy bootstrap script mixes table creation, helper functions, triggers, RLS, and seeded auth accounts in one file.
- production auth accounts must not continue to be seeded from committed SQL with shared default passwords.
- Some RLS policies are still broader than the desired production posture.
- Repository governance files and meta-tests have started to spread across the root.

This plan defines the target production baseline and the order in which to get there.

---

## Target state

### 1. Database lifecycle

Production database changes should come from **versioned migrations**, not from re-running a destructive bootstrap script.

Target split:
- core schema migrations
- helper-function migrations
- trigger / automation migrations
- RLS / grants migrations
- optional dev-only seed path

### 2. Auth and account provisioning

Production auth users must not be seeded by committed SQL.

Target rule:
- `drivers` stores business driver records
- `profiles` stores role + driver binding
- production login accounts are created manually in Supabase Auth or through an admin-only Edge Function
- no shared production default password in committed SQL
- no committed SQL that seeds real production email addresses

### 3. RLS posture

RLS should be explicit and role-scoped.

Target rule:
- admin: full access where operationally required
- driver: only the minimum read/write scope required for that role
- avoid broad `authenticated` full-table read access unless a table is intentionally public-to-all-authenticated users
- policy logic should be grouped and documented by table responsibility

### 4. Repository structure

The repository should move toward clearer boundaries.

Target structure direction:
- `docs/` for operational and production docs
- `tests/repo/` for repository-governance and documentation consistency tests
- `supabase/migrations/` for incremental database changes
- `supabase/bootstrap/` only for non-production bootstrap helpers if still needed
- feature and shell structure kept separated for admin / driver / shared concerns

---

## What changes in V2

### Legacy path
`BAHATI_COMPLETE_SETUP.sql`
- remains a **legacy rebuild helper** for disposable environments only
- is not the production source of truth
- must not be extended with more real production accounts

### Production path
Production setup moves to:
- a clean migration-first baseline
- manual/admin-driven auth provisioning
- documented post-setup verification steps

---

## Execution phases

### Phase 1 — direction lock and governance
This phase is safe to do immediately and is what the repository now starts with.

Includes:
- README points production readers to this plan
- security docs explicitly ban seeded production auth accounts in committed SQL
- repository tests lock the productionization direction
- CI already requires strict test mode for repository quality checks

### Phase 2 — Supabase production baseline rebuild design
Prepare a controlled database redesign without changing app scope.

Deliverables:
- inventory of tables, helper functions, triggers, RLS, and auth dependencies
- identify which legacy policies are too broad
- define the new migration order
- define which seed data stays dev-only and which disappears entirely

### Phase 3 — migration-first database implementation
Implement the new baseline in migrations.

Expected deliverables:
- core schema migrations
- helper function migrations
- trigger migrations
- RLS policy migrations
- docs for production setup and cutover

### Phase 4 — auth provisioning cleanup
Move account creation fully out of committed production SQL.

Expected deliverables:
- production admin account creation checklist
- driver provisioning path via dashboard or Edge Function
- profile binding verification checklist
- default password rotation checklist

### Phase 5 — repository cleanup
After the database baseline is stable, reduce file scatter.

Expected deliverables:
- move repo-governance tests under `tests/repo/`
- keep root focused on app entrypoints and critical config only
- document the preferred locations for docs, tests, and operational files

---

## Non-goals for Phase 1

This phase does **not**:
- rewrite the current production database in one shot
- drop existing RLS or security constraints
- remove audit logic
- expand app feature scope
- silently change live auth behavior

---

## Definition of done for the full V2 effort

The production baseline is considered complete when:
- production no longer depends on `BAHATI_COMPLETE_SETUP.sql`
- real production auth accounts are no longer seeded by committed SQL
- schema / functions / triggers / RLS are migration-first and reviewable in small units
- repository governance tests are organized and not scattered at root
- README and production docs point to one clear setup path

---

## Immediate next implementation task after this plan

Next recommended task:
- create the Supabase production baseline inventory doc
- list every current table, helper function, trigger, and RLS policy
- mark each one as keep / rewrite / split / remove-from-bootstrap

This keeps the next step concrete without doing a risky all-at-once database rewrite.
