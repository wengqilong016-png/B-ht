-- Enforce the client-side Transaction.paymentStatus union at the database layer.
-- Valid states:
--   unpaid  - collection not yet included in a settlement review
--   pending - collection submitted and waiting for settlement review
--   paid    - settlement confirmed
--   rejected - settlement rejected

UPDATE public.transactions
   SET "paymentStatus" = 'unpaid'
 WHERE "paymentStatus" IS NULL
    OR "paymentStatus" NOT IN ('unpaid', 'pending', 'paid', 'rejected');

ALTER TABLE public.transactions
  ALTER COLUMN "paymentStatus" SET DEFAULT 'unpaid',
  ALTER COLUMN "paymentStatus" SET NOT NULL;

ALTER TABLE public.transactions
  DROP CONSTRAINT IF EXISTS transactions_payment_status_check;

ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_payment_status_check
  CHECK ("paymentStatus" IN ('unpaid', 'pending', 'paid', 'rejected'));
