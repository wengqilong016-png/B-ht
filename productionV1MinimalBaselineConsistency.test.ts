import { describe, expect, it, beforeAll } from '@jest/globals';
import fs from 'fs';
import path from 'path';

describe('production V1 minimal baseline consistency', () => {
  const sqlPath = path.join(process.cwd(), 'supabase', 'migrations', '20260325123000_production_v1_minimal_baseline.sql');
  const docPath = path.join(process.cwd(), 'docs', 'PRODUCTION_V1_MINIMAL_SETUP.md');

  let sql: string;
  let doc: string;

  beforeAll(() => {
    sql = fs.readFileSync(sqlPath, 'utf8');
    doc = fs.readFileSync(docPath, 'utf8');
  });

  it('creates only the three minimal production tables', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.drivers');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.profiles');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.locations');
    expect(sql).not.toContain('CREATE TABLE IF NOT EXISTS public.transactions');
    expect(sql).not.toContain('CREATE TABLE IF NOT EXISTS public.daily_settlements');
  });

  it('enables RLS and provides strict role-scoped policies', () => {
    expect(sql).toContain('ALTER TABLE public.drivers ENABLE ROW LEVEL SECURITY;');
    expect(sql).toContain('ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;');
    expect(sql).toContain('ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;');
    expect(sql).toContain('locations_admin_or_assigned_select_v1');
    expect(sql).toContain('drivers_admin_or_self_select_v1');
    expect(sql).toContain('profiles_admin_or_self_select_v1');
  });

  it('does not seed real production auth users or shared default passwords', () => {
    expect(sql).not.toContain('_bahati_seed_user');
    expect(sql).not.toContain('Initial password for ALL accounts');
    expect(sql).not.toContain('Bahati2024');
  });

  it('documents manual first-admin provisioning', () => {
    expect(doc).toContain('Create your first admin user manually');
    expect(doc).toContain("role = 'admin'");
  });
});
