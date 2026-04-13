import { describe, expect, it } from '@jest/globals';

import {
  normalizeDriverId,
  normalizeDriverName,
  normalizeMachineId,
} from '../utils/identityNormalization';

describe('identity normalization', () => {
  it('capitalizes driver names and keeps multi-word names readable', () => {
    expect(normalizeDriverName(' rajabu ')).toBe('Rajabu');
    expect(normalizeDriverName('mALIKI driver')).toBe('Maliki Driver');
  });

  it('uses the normalized driver name when driver id is blank', () => {
    expect(normalizeDriverId('', 'dula')).toBe('Dula');
  });

  it('normalizes provided driver ids before they bind to accounts', () => {
    expect(normalizeDriverId('kombo', 'ignored')).toBe('Kombo');
  });

  it('capitalizes machine ids without changing suffix formatting', () => {
    expect(normalizeMachineId(' f20 (1) ')).toBe('F20 (1)');
    expect(normalizeMachineId('d41（2）')).toBe('D41（2）');
  });
});
