/** Shared helper for Vercel serverless API routes. */

/**
 * Read the first defined, non-empty environment variable from the list.
 * Returns '' if none are set.
 */
export const readEnv = (...names: string[]): string => {
  for (const name of names) {
    const value = process.env[name];
    if (value && value.trim()) {
      return value.trim();
    }
  }
  return '';
};
