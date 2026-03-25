import { describe, it, expect, beforeAll } from '@jest/globals';
import fs from 'fs';
import path from 'path';

describe('stage13 support caseId lookup indexes migration', () => {
  const migrationPath = path.join(
    process.cwd(),
    'supabase/migrations/20260325030000_stage13_support_caseid_lookup_indexes.sql'
  );

  let sql: string;

  beforeAll(() => {
    sql = fs.readFileSync(migrationPath, 'utf8');
  });

  it('creates composite audit trail index on (case_id, created_at DESC) with partial predicate', () => {
    expect(sql).toContain('support_audit_log_case_id_created_at_idx');
    expect(sql).toContain('(case_id, created_at DESC)');
    expect(sql).toMatch(
      /support_audit_log_case_id_created_at_idx[\s\S]*?WHERE\s+case_id\s+IS\s+NOT\s+NULL/i
    );
  });

  it('uses CREATE INDEX IF NOT EXISTS for all indexes', () => {
    const indexStatements = sql.match(/CREATE INDEX/gi) ?? [];
    const ifNotExistsStatements = sql.match(/CREATE INDEX IF NOT EXISTS/gi) ?? [];
    expect(indexStatements.length).toBe(1);
    expect(ifNotExistsStatements.length).toBe(1);
  });

  it('does not include expression indexes on lower(btrim(...))', () => {
    expect(sql).not.toContain('lower(btrim(');
  });

  it('does not alter any table or add constraints', () => {
    expect(sql).not.toMatch(/ALTER\s+TABLE/i);
    expect(sql).not.toMatch(/ADD\s+CONSTRAINT/i);
  });
});
