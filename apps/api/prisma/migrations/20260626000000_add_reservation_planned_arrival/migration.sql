-- Phase 2 reservations: driver-selected planned arrival time.
-- Nullable keeps existing seed/demo reservations migratable without backfill.
ALTER TABLE "reservations"
ADD COLUMN "planned_arrival_at" TIMESTAMPTZ(3);
