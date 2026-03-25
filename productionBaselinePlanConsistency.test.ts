import { describe, expect, it, beforeAll } from '@jest/globals';
import fs from 'fs';
import path from 'path';

describe('production baseline plan consistency', () => {
  const planPath = path.join(process.cwd(), 'docs', 'PRODUCTION_BASELINE_V2_PLAN.md');
  const inventoryPath = path.join(process.cwd(), 'docs', 'PRODUCTION_BASELINE_V2_INVENTORY_TEMPLATE.md');
  const bootstrapPath = path.join(process.cwd(), 'BAHATI_COMPLETE_SETUP.sql');

  let plan: string;
  let inventory: string;
  let bootstrap: string;

  beforeAll(() => {
    plan = fs.readFileSync(planPath, 'utf8');
    inventory = fs.readFileSync(inventoryPath, 'utf8');
    bootstrap = fs.readFileSync(bootstrapPath, 'utf8');
  });

  it('treats the legacy bootstrap script as non-production source of truth', () => {
    expect(plan).toContain('legacy rebuild helper');
    expect(plan).toContain('not the production source of truth');
  });

  it('states that production auth accounts must not continue to be seeded from committed SQL', () => {
    expect(plan).toContain('production auth accounts must not continue to be seeded from committed SQL');
    expect(plan).toContain('no committed SQL that seeds real production email addresses');
  });

  it('provides an inventory template for current schema, functions, triggers, and RLS', () => {
    expect(inventory).toContain('## 1. Core tables');
    expect(inventory).toContain('## 2. Helper functions');
    expect(inventory).toContain('## 3. Triggers and trigger functions');
    expect(inventory).toContain('## 5. RLS inventory');
  });

  it('matches the current reality that bootstrap still contains seeded auth users and passwords', () => {
    expect(bootstrap).toContain('Initial password for ALL accounts');
    expect(bootstrap).toContain('_bahati_seed_user');
  });
});
