import * as fs from 'fs';
import * as path from 'path';

import { describe, expect, it } from '@jest/globals';

const ROOT = path.resolve(__dirname, '..');

function read(relativePath: string): string {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf-8');
}

describe('database constraints', () => {
  it('keeps transactions.paymentStatus constrained to the domain enum', () => {
    const schema = read('supabase/schema.sql');
    const migration = read('supabase/migrations/20260515221500_transactions_payment_status_check.sql');

    for (const sql of [schema, migration]) {
      expect(sql).toContain('transactions_payment_status_check');
      expect(sql).toMatch(/"paymentStatus"\s+IN\s+\('unpaid',\s*'pending',\s*'paid',\s*'rejected'\)/);
    }

    expect(migration).toMatch(/ALTER COLUMN "paymentStatus" SET NOT NULL/);
  });
});
