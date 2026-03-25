import { describe, expect, it, beforeAll } from '@jest/globals';
import fs from 'fs';
import path from 'path';

describe('production full support and audit baseline consistency', () => {
  const sqlPath = path.join(
    process.cwd(),
    'supabase',
    'migrations',
    '20260325140000_production_full_02_support_and_audit.sql',
  );
  const docPath = path.join(
    process.cwd(),
    'docs',
    'PRODUCTION_FULL_02_SUPPORT_AND_AUDIT.md',
  );

  let sql: string;
  let doc: string;

  beforeAll(() => {
    sql = fs.readFileSync(sqlPath, 'utf8');
    doc = fs.readFileSync(docPath, 'utf8');
  });

  it('creates only support and audit tables for layer 02', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.support_cases');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.support_audit_log');
    expect(sql).not.toContain('CREATE TABLE IF NOT EXISTS public.health_alerts');
    expect(sql).not.toContain('CREATE TABLE IF NOT EXISTS public.queue_health_reports');
  });

  it('uses public.is_admin() instead of a second profile identity contract', () => {
    expect(sql).toContain('USING (public.is_admin());');
    expect(sql).not.toContain('profiles.id = auth.uid()');
    expect(doc).toContain('public.is_admin()');
    expect(doc).toContain('profiles.auth_user_id');
  });

  it('keeps support_audit_log append-only for authenticated inserts', () => {
    expect(sql).toContain('support_audit_log_auth_insert_full_v1');
    expect(doc).toContain('may append audit events');
    expect(doc).toContain('may not update or delete audit rows');
  });

  it('documents the next pack file as diagnostics and health', () => {
    expect(doc).toContain('03_diagnostics_and_health.sql');
  });
});
