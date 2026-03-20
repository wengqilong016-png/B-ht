/**
 * Password strength policy — mirrored from root utils/passwordPolicy.ts.
 * Kept as a local copy because driver-app is a separate Vite build and
 * cannot import across the monorepo boundary at runtime.
 */

export const MIN_PASSWORD_LENGTH = 8;

/** Returns null when the password is valid, or a bilingual error string. */
export const validatePassword = (pwd: string): string | null => {
  if (pwd.length < MIN_PASSWORD_LENGTH)
    return '密码至少8位 / Password must be at least 8 characters';
  if (!/[A-Z]/.test(pwd))
    return '密码须包含大写字母 / Must contain an uppercase letter';
  if (!/[a-z]/.test(pwd))
    return '密码须包含小写字母 / Must contain a lowercase letter';
  if (!/[0-9]/.test(pwd))
    return '密码须包含数字 / Must contain a number';
  return null;
};
