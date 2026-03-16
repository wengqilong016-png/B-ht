# Delivery Standards

<!-- TODO: Expand with team-agreed checklists and CI gate requirements -->

This document defines the development and delivery standards for the Bahati Jackpots project.

## Pre-Merge Checklist

- [ ] `npm run build` passes with zero TypeScript errors
- [ ] No secrets or credentials committed to source code
- [ ] Offline-first pattern followed: save locally (`isSynced: false`) before Supabase upsert
- [ ] `safeRandomUUID()` used instead of `crypto.randomUUID()` (iOS Safari compatibility)
- [ ] New UI strings added to `TRANSLATIONS` in `types.ts` (admin → `zh`, driver → `sw`)

## Code Conventions

- Minimal, surgical changes only — no unrelated refactors
- TypeScript `any` is prohibited; use specific types
- New Supabase queries appended to `hooks/useSupabaseData.ts`; new mutations to `hooks/useSupabaseMutations.ts`
- Console logs use English with `[Bahati]` prefix

## Security Standards

- `.env` and all secret files must never be committed (enforced via `.gitignore`)
- Supabase RLS policies must be reviewed for any new table
- Backup/credential files (`*.backup.json`, `*_credentials*`) are gitignored

<!-- TODO: Add branching strategy and release process -->

