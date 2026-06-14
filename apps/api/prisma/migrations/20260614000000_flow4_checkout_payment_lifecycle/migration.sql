-- Flow 4A.1: checkout/payment lifecycle foundation.
-- Keep Prisma enum values lowercase.

ALTER TYPE "SessionStatus" ADD VALUE IF NOT EXISTS 'checkout_pending';
ALTER TYPE "SessionStatus" ADD VALUE IF NOT EXISTS 'exit_authorized';

ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'bank_qr';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PaymentStatus') THEN
    CREATE TYPE "PaymentStatus" AS ENUM ('pending', 'paid', 'failed', 'cancelled', 'expired');
  END IF;
END $$;

-- Existing payment rows represented already-collected cash payments before Flow 4,
-- so backfill them as paid, then set pending as the default for new payments.
ALTER TABLE "payments"
  ADD COLUMN IF NOT EXISTS "status" "PaymentStatus" NOT NULL DEFAULT 'paid';

ALTER TABLE "payments"
  ALTER COLUMN "status" SET DEFAULT 'pending',
  ALTER COLUMN "paid_at" DROP NOT NULL,
  ALTER COLUMN "received_by" DROP NOT NULL;

UPDATE "parking_sessions"
SET "session_code" = 'PBMS-' || UPPER(SUBSTRING(REPLACE("id"::text, '-', ''), 1, 10))
WHERE "session_code" IS NULL;

ALTER TABLE "parking_sessions"
  ALTER COLUMN "session_code" SET NOT NULL;
