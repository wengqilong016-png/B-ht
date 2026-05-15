-- Drop obsolete Phase 1/2 ledger RPCs that reference retired tables not present
-- in the current production schema. They are unused by the application and make
-- remote schema lint fail before pending migrations can be validated.

DROP FUNCTION IF EXISTS public.record_task_settlement(UUID);
DROP FUNCTION IF EXISTS public.submit_daily_reconciliation(TEXT, DATE, TEXT);
