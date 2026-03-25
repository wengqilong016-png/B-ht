import { describe, expect, it, beforeAll } from '@jest/globals';
import fs from 'fs';
import path from 'path';

describe('production full diagnostics and health baseline consistency', () => {
  const sqlPath = path.join(
    process.cwd(),
    'supabase',
    'migrations',
    '20260325150000_production_full_03_diagnostics_and_health.sql',
  );
  const docPath = path.join(
    process.cwd(),
    'docs',
    'PRODUCTION_FULL_03_DIAGNOSTICS_AND_HEALTH.md',
  );

  let sql: string;
  let doc: string;

  beforeAll(() => {
    sql = fs.readFileSync(sqlPath, 'utf8');
    doc = fs.readFileSync(docPath, 'utf8');
  });

  it('creates only diagnostics and health tables for layer 03', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.queue_health_reports');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.health_alerts');
    expect(sql).not.toContain('CREATE TABLE IF NOT EXISTS public.support_cases');
    expect(sql).not.toContain('CREATE TABLE IF NOT EXISTS public.support_audit_log');
  });

  it('defines health generation thresholds and generation function', () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.generate_health_alerts_v1()');
    expect(sql).toContain("'dead_letter_items'");
    expect(sql).toContain("'stale_snapshot'");
    expect(sql).toContain("'high_retry_waiting'");
    expect(sql).toContain("'high_pending'");
    expect(doc).toContain('dead_letter_count >= 1');
    expect(doc).toContain("retry_waiting_count > 5");
    expect(doc).toContain("pending_count > 20");
  });

  it('keeps health_alerts admin-only while allowing drivers to write own queue health snapshots', () => {
    expect(sql).toContain('queue_health_reports_admin_or_driver_insert_full_v1');
    expect(sql).toContain('queue_health_reports_admin_or_driver_update_full_v1');
    expect(sql).toContain('health_alerts_admin_select_full_v1');
    expect(doc).toContain('may insert/update own `queue_health_reports` snapshot rows');
    expect(doc).toContain('may not read `health_alerts`');
  });

  it('documents completion of the current production full baseline pack', () => {
    expect(doc).toContain('This file completes the current production full baseline pack layers');
    expect(doc).toContain('03_diagnostics_and_health.sql');
  });
});
