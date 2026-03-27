# Production V1 Minimal Setup

This setup is the simplest production-oriented baseline for Bahati.

## Scope

It keeps only these tables:
- `profiles`
- `drivers`
- `locations`

It is designed for the current simplified production need:
- login identity
- driver account records
- office / location assignment to drivers

## SQL file

Run this file in Supabase SQL Editor:
- `supabase/migrations/20260325123000_production_v1_minimal_baseline.sql`

## What it does

- creates the three core tables if they do not already exist
- creates helper role functions
- enables RLS on all three tables
- applies strict role-scoped policies:
  - admin can manage everything
  - driver can read only their own driver/profile records
  - driver can read only locations assigned to them

## What it does NOT do

- does not drop existing tables
- does not seed real production auth users
- does not set a shared default password
- does not create transactions / settlements / support / audit tables

## First admin setup

After running the SQL:

1. Create your first admin user manually in Supabase Authentication.
2. Copy that auth user's UUID.
3. Insert a matching profile row with `role = 'admin'`:

```sql
INSERT INTO public.profiles (auth_user_id, role, display_name, driver_id)
VALUES ('<auth-user-uuid>', 'admin', 'Admin', NULL);
```

## Creating drivers

1. Insert a row into `public.drivers`
2. Create the driver's auth account in Supabase Authentication
3. Insert the matching `public.profiles` row with `role='driver'` and the driver's `driver_id`
4. Assign the driver to one or more `public.locations` rows via `assignedDriverId`

## Production note

This is a simplified production baseline, not the final full-system production baseline.

Use this when the real requirement is only:
- who can log in
- which driver exists
- which location belongs to which driver
