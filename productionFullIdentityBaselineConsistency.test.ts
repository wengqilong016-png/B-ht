import { describe, expect, it, beforeAll } from '@jest/globals';
import fs from 'fs';
import path from 'path';

describe('production full identity baseline consistency', () => {
  const sqlPath = path.join(
    process.cwd(),
    'supabase',
    'migrations',
    '20260325130000_production_full_00_identity_and_assignment.sql',
  );
  const docPath = path.join(
    process.cwd(),
    'docs',
    'PRODUCTION_FULL_00_IDENTITY_AND_ASSIGNMENT.md',
  );

  let sql: string;
  let doc: string;

  beforeAll(() => {
    sql = fs.readFileSync(sqlPath, 'utf8');
    doc = fs.readFileSync(docPath, 'utf8');
  });

  it('uses auth_user_id as the canonical identity key in profiles', () => {
    expect(sql).toContain('auth_user_id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE');
    expect(sql).not.toContain('profiles.id = auth.uid()');
    expect(doc).toContain('profiles.auth_user_id');
  });

  it('creates the three identity-layer tables and no business-flow tables', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.drivers');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.profiles');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.locations');
    expect(sql).not.toContain('CREATE TABLE IF NOT EXISTS public.transactions');
    expect(sql).not.toContain('CREATE TABLE IF NOT EXISTS public.daily_settlements');
  });

  it('enables strict admin and driver role-scoped RLS for the identity layer', () => {
    expect(sql).toContain('ALTER TABLE public.drivers ENABLE ROW LEVEL SECURITY;');
    expect(sql).toContain('ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;');
    expect(sql).toContain('ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;');
    expect(sql).toContain('drivers_admin_or_self_select_full_v1');
    expect(sql).toContain('profiles_admin_or_self_select_full_v1');
    expect(sql).toContain('locations_admin_or_assigned_select_full_v1');
  });

  it('does not seed real production auth users or shared default passwords', () => {
    expect(sql).not.toContain('_bahati_seed_user');
    expect(sql).not.toContain('Bahati2024');
    expect(sql).not.toContain('Initial password for ALL accounts');
    expect(doc).toContain('Create your first admin user manually');
  });
});
