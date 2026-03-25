import fs from 'fs';
import path from 'path';

describe('stage11D support_audit_log case_id FK migration', () => {
  const migrationPath = path.join(
    process.cwd(),
    'supabase/migrations/20260325010000_stage11d_support_audit_log_case_fk_not_valid.sql'
  );

  it('adds support_audit_log_case_id_fkey as NOT VALID', () => {
    const sql = fs.readFileSync(migrationPath, 'utf8');

    expect(sql).toContain('ADD CONSTRAINT support_audit_log_case_id_fkey');
    expect(sql).toContain('FOREIGN KEY (case_id)');
    expect(sql).toContain('REFERENCES public.support_cases(id)');
    expect(sql).toContain('NOT VALID;');
  });

  it('does not execute a validation statement in stage11D', () => {
    const sql = fs.readFileSync(migrationPath, 'utf8');

    expect(sql).not.toMatch(/validate\s+constraint\s+support_audit_log_case_id_fkey/i);
  });
});
