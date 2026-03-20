/**
 * Password strength policy enforced across the app.
 *
 * Requirements:
 *   - At least MIN_PASSWORD_LENGTH characters
 *   - At least one uppercase letter (A–Z)
 *   - At least one lowercase letter (a–z)
 *   - At least one digit (0–9)
 */

export const MIN_PASSWORD_LENGTH = 8;

/**
 * Returns true when the password meets the minimum complexity policy.
 * Used by ForcePasswordChange and AccountSettings to validate new passwords
 * before submitting them to Supabase Auth.
 */
export const isPasswordStrong = (pwd: string): boolean =>
  pwd.length >= MIN_PASSWORD_LENGTH &&
  /[A-Z]/.test(pwd) &&
  /[a-z]/.test(pwd) &&
  /[0-9]/.test(pwd);
