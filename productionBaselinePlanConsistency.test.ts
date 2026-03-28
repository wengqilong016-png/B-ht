import { describe, expect, it, beforeAll } from '@jest/globals';
import fs from 'fs';
import path from 'path';

describe('production baseline plan consistency', () => {
  const planPath = path.join(process.cwd(), 'docs', 'PRODUCTION_BASELINE_V2_PLAN.md');
  const inventoryPath = path.join(process.cwd(), 'docs', 'PRODUCTION_BASELINE_V2_INVENTORY_TEMPLATE.md');

  let plan: string;
  let inventory: string;

  beforeAll(() => {
    plan = fs.readFileSync(planPath, 'utf8');
    inventory = fs.readFileSync(inventoryPath, 'utf8');
  });

  it('states that production auth accounts must not be seeded from committed SQL', () => {
    expect(plan).toContain('real production auth accounts are no longer seeded by committed SQL');
    expect(plan).toContain('no committed SQL that seeds real production email addresses');
  });

  it('provides an inventory template for current schema, functions, triggers, and RLS', () => {
    expect(inventory).toContain('## 1. Core tables');
    expect(inventory).toContain('## 2. Helper functions');
    expect(inventory).toContain('## 3. Triggers and trigger functions');
    expect(inventory).toContain('## 5. RLS inventory');
  });
});
