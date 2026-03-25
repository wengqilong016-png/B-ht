# Production Full Baseline Pack — 01 Business Flow

This is the second file in the coherent production baseline pack.

## File

- `supabase/migrations/20260325133000_production_full_01_business_flow.sql`

## Scope

This file creates and secures the business-flow layer:
- `transactions`
- `daily_settlements`
- `location_change_requests`
- business-flow indexes
- admin approval function for location change requests
- business-flow RLS

## Assumes

This file assumes the identity layer is already applied:
- `drivers`
- `profiles`
- `locations`
- `get_my_role()`
- `get_my_driver_id()`
- `is_admin()`

## RLS model in this layer

### Admin
- full read/write on `transactions`
- full read/write on `daily_settlements`
- full review access on `location_change_requests`

### Driver
- can read only own `transactions`
- can insert only own `transactions`
- can read only own `daily_settlements`
- can insert only own `daily_settlements`
- can create own `location_change_requests`
- can read only own `location_change_requests`

## What this file does NOT do

- does not create support / audit tables
- does not create diagnostics / health tables
- does not seed real production auth users

## Next pack file

After this layer is stable, the next coherent production file should be:
- `02_support_and_audit.sql`
