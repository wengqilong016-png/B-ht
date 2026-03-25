import { describe, expect, it, beforeAll } from '@jest/globals';
import fs from 'fs';
import path from 'path';

describe('production full business-flow baseline consistency', () => {
  const sqlPath = path.join(
    process.cwd(),
    'supabase',
    'migrations',
    '20260325133000_production_full_01_business_flow.sql',
  );
  const docPath = path.join(
    process.cwd(),
    'docs',
    'PRODUCTION_FULL_01_BUSINESS_FLOW.md',
  );

  let sql: string;
  let doc: string;

  beforeAll(() => {
    sql = fs.readFileSync(sqlPath, 'utf8');
    doc = fs.readFileSync(docPath, 'utf8');
  });

  it('creates only the business-flow tables for layer 01', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.transactions');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.daily_settlements');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.location_change_requests');
    expect(sql).not.toContain('CREATE TABLE IF NOT EXISTS public.support_cases');
    expect(sql).not.toContain('CREATE TABLE IF NOT EXISTS public.support_audit_log');
  });

  it('enables RLS and applies admin/driver business-flow policies', () => {
    expect(sql).toContain('ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;');
    expect(sql).toContain('ALTER TABLE public.daily_settlements ENABLE ROW LEVEL SECURITY;');
    expect(sql).toContain('ALTER TABLE public.location_change_requests ENABLE ROW LEVEL SECURITY;');
    expect(sql).toContain('transactions_admin_or_driver_select_full_v1');
    expect(sql).toContain('settlements_admin_or_driver_select_full_v1');
    expect(sql).toContain('lcr_requester_or_admin_select_full_v1');
  });

  it('keeps support and diagnostics out of layer 01', () => {
    expect(doc).toContain('does not create support / audit tables');
    expect(doc).toContain('does not create diagnostics / health tables');
  });

  it('documents the next pack file as support and audit', () => {
    expect(doc).toContain('02_support_and_audit.sql');
  });
});
