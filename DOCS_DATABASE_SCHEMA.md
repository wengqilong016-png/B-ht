# Database Schema Documentation

<!-- TODO: Expand with full table descriptions, column types, and RLS policy details -->

This document provides an overview of the Bahati Jackpots Supabase database schema.

## Tables

| Table | Description |
|-------|-------------|
| `profiles` | User profiles linked to Supabase auth users; stores role (`admin` / `driver`) |
| `drivers` | Driver records with TEXT `id`, name, phone, and status |
| `locations` | Machine locations with GPS coords and `assignedDriverId` |
| `transactions` | Collection records submitted by drivers |
| `machines` | Slot machine inventory |
| `routes` | Assigned collection routes |
| `audit_log` | Audit trail for sensitive operations |

## Key Conventions

- `locations.id` is UUID; `drivers.id` is TEXT.
- RLS is enabled on all 7 public tables using `get_my_role()` and `get_my_driver_id()` SECURITY DEFINER helpers.
- See `setup_db.sql` and `supabase/migrations/` for the authoritative schema.

<!-- TODO: Add column-level details and ERD diagram -->

