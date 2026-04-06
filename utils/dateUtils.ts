/**
 * Date utilities that are aware of the Tanzania time zone (UTC+3).
 *
 * Using `new Date().toISOString().split('T')[0]` returns a UTC date, which
 * diverges from the local date every night between 21:00 and 24:00 EAT.
 * Always use getTodayLocalDate() instead.
 */

const TANZANIA_TZ = 'Africa/Dar_es_Salaam';

/**
 * Returns today's date string in YYYY-MM-DD format for the given time zone.
 * Defaults to Tanzania (EAT, UTC+3).
 *
 * @example
 * getTodayLocalDate() // "2026-04-06"
 */
export function getTodayLocalDate(tz: string = TANZANIA_TZ): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: tz });
}
