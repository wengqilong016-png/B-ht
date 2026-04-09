/**
 * __tests__/phase0_authority_lock.test.ts
 *
 * Phase 0 acceptance tests:
 *   1. No new .ts/.tsx code references deprecated table names as Supabase
 *      `.from()` targets (machines, profiles, daily_tasks).
 *   2. All `.rpc()` calls use named-parameter objects (p_xxx keys).
 *   3. Phase 1 & Phase 2 authoritative SQL files exist.
 *   4. SECURITY DEFINER functions pin search_path = public, pg_temp.
 */

import * as fs   from 'fs';
import * as path from 'path';

import { describe, it, expect } from '@jest/globals';

const ROOT = path.resolve(__dirname, '..');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Recursively collect files matching given extensions, skipping excludes. */
function collectFiles(
  dir: string,
  extensions: string[],
  exclude: string[] = ['node_modules', '.git', 'dist', 'android', '__mocks__', '__tests__'],
): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (exclude.includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectFiles(full, extensions, exclude));
    } else if (extensions.some(ext => entry.name.endsWith(ext))) {
      results.push(full);
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// 1. Deprecated .from() table names
// ---------------------------------------------------------------------------

describe('Phase 0 — no new .from() calls targeting deprecated tables', () => {
  /**
   * Known legacy usages that predate Phase 0 and will be migrated in later
   * stages.  We allowlist them here so the test catches only NEW violations.
   *
   * Format: relative path (from repo root) → set of allowed deprecated names.
   */
  const LEGACY_ALLOWLIST: Record<string, Set<string>> = {
    'services/authService.ts':                  new Set(['profiles']),
    'supabase/functions/_shared/authz.ts':      new Set(['profiles']),
    'supabase/functions/create-driver/index.ts': new Set(['profiles']),
    'supabase/functions/delete-driver/index.ts': new Set(['profiles']),
  };

  // Matches  .from('tableName')  or  .from("tableName")
  const FROM_RE = /\.from\(\s*['"](\w+)['"]\s*\)/g;

  const DEPRECATED_TABLES = new Set(['machines', 'profiles', 'daily_tasks']);

  const tsFiles = collectFiles(ROOT, ['.ts', '.tsx']);

  it('does not add new .from() calls to deprecated tables', () => {
    const violations: string[] = [];

    for (const file of tsFiles) {
      const rel = path.relative(ROOT, file);
      const content = fs.readFileSync(file, 'utf-8');
      let match: RegExpExecArray | null;

      // Reset lastIndex for global regex
      FROM_RE.lastIndex = 0;
      while ((match = FROM_RE.exec(content)) !== null) {
        const tableName = match[1];
        if (!DEPRECATED_TABLES.has(tableName)) continue;

        // Check allowlist
        const allowed = LEGACY_ALLOWLIST[rel];
        if (allowed && allowed.has(tableName)) continue;

        const line = content.substring(0, match.index).split('\n').length;
        violations.push(`${rel}:${line} — .from('${tableName}')`);
      }
    }

    expect(violations).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 2. RPC calls use named parameters
// ---------------------------------------------------------------------------

describe('Phase 0 — .rpc() calls use named parameter objects', () => {
  // Matches  .rpc('rpcName', { ... })  — we verify at least one p_ key exists
  const RPC_RE = /\.rpc\(\s*['"](\w+)['"]\s*,\s*\{([^}]*)\}/gs;

  const tsFiles = collectFiles(ROOT, ['.ts', '.tsx']);

  it('every .rpc() call passes named p_ parameters', () => {
    const violations: string[] = [];

    for (const file of tsFiles) {
      const rel = path.relative(ROOT, file);
      const content = fs.readFileSync(file, 'utf-8');
      let match: RegExpExecArray | null;

      RPC_RE.lastIndex = 0;
      while ((match = RPC_RE.exec(content)) !== null) {
        const rpcName   = match[1];
        const paramBody = match[2];

        // If param body is empty, that is fine (RPCs with no args or all defaults)
        if (paramBody.trim().length === 0) continue;

        // Ensure at least one key starts with p_
        if (!/\bp_\w+/.test(paramBody)) {
          const line = content.substring(0, match.index).split('\n').length;
          violations.push(
            `${rel}:${line} — .rpc('${rpcName}') params lack p_ prefix`,
          );
        }
      }
    }

    expect(violations).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 3. Authoritative SQL files exist
// ---------------------------------------------------------------------------

describe('Phase 0 — authoritative migration files exist', () => {
  const MIGRATIONS_DIR = path.join(ROOT, 'supabase', 'migrations');

  it('Phase 1 schema exists', () => {
    const p1 = path.join(MIGRATIONS_DIR, '20240104000000_phase1_complete_schema.sql');
    expect(fs.existsSync(p1)).toBe(true);
  });

  it('Phase 2 ledger / reconciliation exists', () => {
    const p2 = path.join(MIGRATIONS_DIR, '20240105000000_phase2_ledger_reconciliation.sql');
    expect(fs.existsSync(p2)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 4. SECURITY DEFINER functions include search_path pinning
// ---------------------------------------------------------------------------

describe('Phase 0 — SECURITY DEFINER functions pin search_path', () => {
  const phase1 = path.join(ROOT, 'supabase', 'migrations',
    '20240104000000_phase1_complete_schema.sql');
  const phase2 = path.join(ROOT, 'supabase', 'migrations',
    '20240105000000_phase2_ledger_reconciliation.sql');

  for (const file of [phase1, phase2]) {
    const label = path.basename(file);
    const content = fs.readFileSync(file, 'utf-8');

    // Find all SECURITY DEFINER blocks
    const sdBlocks = content.split(/CREATE OR REPLACE FUNCTION/).slice(1);

    for (const block of sdBlocks) {
      if (!/SECURITY\s+DEFINER/i.test(block)) continue;

      // Extract function name (first token after the split point)
      const nameMatch = block.match(/^\s*([\w.]+)\s*\(/);
      const fnName = nameMatch ? nameMatch[1] : '(unknown)';

      it(`${label} — ${fnName} sets search_path`, () => {
        expect(block).toMatch(/SET\s+search_path\s*=\s*public\s*,\s*pg_temp/i);
      });
    }
  }
});
