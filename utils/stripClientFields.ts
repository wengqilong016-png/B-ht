/**
 * Remove client-only fields before sending data to Supabase.
 * Fields like `isSynced` and `stats` are tracked locally and must not
 * be sent to the database where those columns may not exist.
 */
const CLIENT_ONLY_FIELDS = ['isSynced', 'stats'] as const;

export function stripClientFields<T extends Record<string, unknown>>(obj: T): T {
  const copy = { ...obj };
  for (const field of CLIENT_ONLY_FIELDS) {
    delete (copy as Record<string, unknown>)[field];
  }
  return copy;
}
