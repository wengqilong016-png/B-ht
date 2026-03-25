# Production Full Baseline Pack — 00 Identity and Assignment

This is the first file in the coherent production baseline pack.

## File

- `supabase/migrations/20260325130000_production_full_00_identity_and_assignment.sql`

## Scope

This file creates and secures only the first production layer:
- `drivers`
- `profiles`
- `locations`
- helper role functions
- identity-layer RLS

## Why this comes first

Every later production layer depends on this contract:
- who is admin
- who is driver
- which driver is bound to which locations
- how RLS resolves the current user's role and driver binding

## Canonical identity contract

Use this contract everywhere in later layers:
- `profiles.auth_user_id` is the canonical identity key
- `profiles.role` is the app role
- `profiles.driver_id` is the optional driver binding

Later business/support/audit layers should not introduce a second identity contract.

## What this file does NOT do

- does not drop old tables
- does not seed real production auth users
- does not assign a shared default password
- does not create transactions / settlements / support / diagnostics tables

## First admin setup

After running the SQL:

1. Create your first admin user manually in Supabase Authentication.
2. Copy that auth user's UUID.
3. Insert the matching profile row:

```sql
INSERT INTO public.profiles (auth_user_id, role, display_name, driver_id)
VALUES ('<auth-user-uuid>', 'admin', 'Admin', NULL);
```

## Driver setup

1. Insert the driver row into `public.drivers`
2. Create the driver's auth user in Supabase Authentication
3. Insert the driver's `public.profiles` row with `role='driver'` and the matching `driver_id`
4. Assign locations by setting `public.locations.assignedDriverId`

## RLS model in this layer

### Admin
- full read/write on `drivers`
- full read/write on `profiles`
- full read/write on `locations`

### Driver
- read own `profiles` row
- read own `drivers` row
- read only locations assigned to their `driver_id`

## Next pack file

After this layer is stable, the next coherent production file should be the business layer:
- `01_business_flow.sql`

That file should bring in:
- `transactions`
- `daily_settlements`
- `location_change_requests`
