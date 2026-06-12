-- Store application timestamps as UTC instants with timezone metadata.
-- Existing TIMESTAMP values were written by Prisma as UTC instants, so interpret
-- them as UTC during conversion to avoid shifting data under local DB timezone.

ALTER TABLE "users"
  ALTER COLUMN "created_at" TYPE TIMESTAMPTZ(3) USING "created_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "updated_at" TYPE TIMESTAMPTZ(3) USING "updated_at" AT TIME ZONE 'UTC';

ALTER TABLE "parking_sessions"
  ALTER COLUMN "check_in_time" TYPE TIMESTAMPTZ(3) USING "check_in_time" AT TIME ZONE 'UTC',
  ALTER COLUMN "check_out_time" TYPE TIMESTAMPTZ(3) USING "check_out_time" AT TIME ZONE 'UTC';

ALTER TABLE "reservations"
  ALTER COLUMN "created_at" TYPE TIMESTAMPTZ(3) USING "created_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "expires_at" TYPE TIMESTAMPTZ(3) USING "expires_at" AT TIME ZONE 'UTC';

ALTER TABLE "payments"
  ALTER COLUMN "paid_at" TYPE TIMESTAMPTZ(3) USING "paid_at" AT TIME ZONE 'UTC';

ALTER TABLE "pricing_configs"
  ALTER COLUMN "updated_at" TYPE TIMESTAMPTZ(3) USING "updated_at" AT TIME ZONE 'UTC';

ALTER TABLE "system_configs"
  ALTER COLUMN "updated_at" TYPE TIMESTAMPTZ(3) USING "updated_at" AT TIME ZONE 'UTC';

ALTER TABLE "simulation_runs"
  ALTER COLUMN "created_at" TYPE TIMESTAMPTZ(3) USING "created_at" AT TIME ZONE 'UTC';
