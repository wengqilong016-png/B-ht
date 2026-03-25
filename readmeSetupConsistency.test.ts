import { describe, expect, it, beforeAll } from '@jest/globals';
import fs from 'fs';
import path from 'path';

describe('README setup consistency', () => {
  const readmePath = path.join(process.cwd(), 'README.md');

  let readme: string;

  beforeAll(() => {
    readme = fs.readFileSync(readmePath, 'utf8');
  });

  it('documents the destructive bootstrap path and points incremental updates to migrations', () => {
    expect(readme).toContain('destructive bootstrap script');
    expect(readme).toContain('do not run `BAHATI_COMPLETE_SETUP.sql`');
    expect(readme).toContain('`supabase/migrations/`');
  });

  it('does not advertise stale local sample-account sections in README', () => {
    expect(readme).not.toContain('Local Development Test Accounts');
    expect(readme).not.toContain('Driver 1');
    expect(readme).not.toContain('Driver 2');
    expect(readme).not.toContain('Driver 3');
    expect(readme).not.toContain('Driver 4');
  });

  it('documents repository quality gates including strict CI test mode', () => {
    expect(readme).toContain('`npm run test:ci`');
    expect(readme).toContain('`npm run typecheck`');
    expect(readme).toContain('`npm run build`');
    expect(readme).toContain('Local vs CI test modes');
  });
});
