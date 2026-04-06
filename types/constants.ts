/** Application-wide constants. Import from here instead of hard-coding values. */

/** PostgREST error code returned when .single() finds no matching row. */
export const PGRST_NO_ROWS = 'PGRST116';

export const CONSTANTS = {
  COIN_VALUE_TZS: 200,
  DEFAULT_PROFIT_SHARE: 0.15,
  DEBT_RECOVERY_RATE: 0.10,
  ROLLOVER_THRESHOLD: 10000,
  OFFLINE_STORAGE_KEY: 'kiosk_offline_tx',
  STORAGE_LOCATIONS_KEY: 'kiosk_locations_data',
  STORAGE_DRIVERS_KEY: 'kiosk_drivers_data_v3',
  STORAGE_SETTLEMENTS_KEY: 'kiosk_daily_settlements',
  STORAGE_TRANSACTIONS_KEY: 'kiosk_transactions_data',
  STORAGE_AI_LOGS_KEY: 'kiosk_ai_logs',
  GEMINI_KEY_STORAGE: 'bahati_gemini_key',
  STORAGE_NOTIFICATIONS_KEY: 'kiosk_notifications',
  IMAGE_MAX_WIDTH: 800,
  IMAGE_QUALITY: 0.6,
  STAGNANT_DAYS_THRESHOLD: 7,
  /** Minimum absolute difference between user-entered score and AI-recognised score
   *  to flag a transaction as anomalous. Increase to reduce false-positives. */
  ANOMALY_SCORE_DIFF_THRESHOLD: 50,
} as const;
