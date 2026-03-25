import { describe, expect, it } from '@jest/globals';
import fs from 'fs';
import path from 'path';

describe('stage14 renderer type tightening', () => {
  const adminRendererPath = path.join(process.cwd(), 'admin', 'renderAdminShellView.tsx');
  const driverRendererPath = path.join(process.cwd(), 'driver', 'renderDriverShellView.tsx');

  it('admin renderer removes broad any props and uses domain/imported types', () => {
    const src = fs.readFileSync(adminRendererPath, 'utf8');
    expect(src).not.toContain(': any');
    expect(src).toContain('UseMutationResult');
    expect(src).toContain('SyncMutationHandle');
    expect(src).toContain('User');
    expect(src).toContain('Location[]');
    expect(src).toContain('Driver[]');
    expect(src).toContain('Transaction[]');
    expect(src).toContain('DailySettlement[]');
    expect(src).toContain('AILog[]');
  });

  it('driver renderer removes broad any props and uses domain/imported types', () => {
    const src = fs.readFileSync(driverRendererPath, 'utf8');
    expect(src).not.toContain(': any');
    expect(src).toContain('UseMutationResult');
    expect(src).toContain('SyncMutationHandle');
    expect(src).toContain('User');
    expect(src).toContain('Location[]');
    expect(src).toContain('Driver[]');
    expect(src).toContain('Transaction[]');
    expect(src).toContain('DailySettlement[]');
    expect(src).toContain('AILog[]');
  });
});
