import { describe, expect, it, beforeAll } from '@jest/globals';
import fs from 'fs';
import path from 'path';

describe('repository quality workflow consistency', () => {
  const packageJsonPath = path.join(process.cwd(), 'package.json');
  const workflowPath = path.join(process.cwd(), '.github', 'workflows', 'repository-quality.yml');

  let packageJson: any;
  let workflow: string;

  beforeAll(() => {
    packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    workflow = fs.readFileSync(workflowPath, 'utf8');
  });

  it('defines a strict CI test script without passWithNoTests', () => {
    expect(packageJson.scripts['test:ci']).toBe('jest --no-coverage');
    expect(packageJson.scripts['test:ci']).not.toContain('passWithNoTests');
  });

  it('keeps local test mode permissive for ad hoc development', () => {
    expect(packageJson.scripts.test).toContain('passWithNoTests');
  });

  it('runs strict CI test mode in repository-quality workflow', () => {
    expect(workflow).toContain('run: npm run test:ci');
    expect(workflow).not.toContain('run: npm test');
  });
});
