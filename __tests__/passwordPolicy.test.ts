/**
 * __tests__/passwordPolicy.test.ts
 * Tests for the shared password-strength policy utility.
 */

import { describe, it, expect } from '@jest/globals';
import { isPasswordStrong, MIN_PASSWORD_LENGTH } from '../utils/passwordPolicy';

describe('isPasswordStrong()', () => {
  it('rejects passwords shorter than MIN_PASSWORD_LENGTH', () => {
    // 7 chars with all complexity requirements met — rejected solely due to length
    expect(isPasswordStrong('Abc1xyz')).toBe(false);
  });

  it('rejects passwords without an uppercase letter', () => {
    expect(isPasswordStrong('abcdefg1')).toBe(false);
  });

  it('rejects passwords without a lowercase letter', () => {
    expect(isPasswordStrong('ABCDEFG1')).toBe(false);
  });

  it('rejects passwords without a digit', () => {
    expect(isPasswordStrong('Abcdefgh')).toBe(false);
  });

  it('rejects trivially weak default passwords', () => {
    expect(isPasswordStrong('admin')).toBe(false);
    expect(isPasswordStrong('feilong')).toBe(false);
    expect(isPasswordStrong('q')).toBe(false);
    expect(isPasswordStrong('sudi')).toBe(false);
  });

  it('accepts a password that meets all requirements', () => {
    expect(isPasswordStrong('Bahati2024!')).toBe(true);
    expect(isPasswordStrong('SecurePass1')).toBe(true);
  });

  it('accepts a password that is exactly MIN_PASSWORD_LENGTH chars', () => {
    // Exactly 8 chars: uppercase + lowercase + digit + filler
    expect(isPasswordStrong('Abcde1fg')).toBe(true);
  });
});
