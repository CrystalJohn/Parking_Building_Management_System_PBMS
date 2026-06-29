-- Final reservation model: a reservation is a 60-minute short-term hold.
-- slot.status remains the present-state source of truth:
-- available = free now, reserved = held by active reservation,
-- occupied = vehicle parked, maintenance = closed.

INSERT INTO "system_configs" ("config_key", "config_value", "description", "updated_at", "updated_by")
VALUES (
  'reservation_timeout_minutes',
  '60',
  'Short-term reservation hold duration in minutes',
  NOW(),
  'system'
)
ON CONFLICT ("config_key") DO UPDATE
SET
  "config_value" = '60',
  "description" = 'Short-term reservation hold duration in minutes',
  "updated_at" = NOW(),
  "updated_by" = 'system';

CREATE UNIQUE INDEX IF NOT EXISTS "uniq_active_reservation_per_driver_type"
ON "reservations" ("driver_id", "vehicle_type")
WHERE "status" = 'active';

DROP INDEX IF EXISTS "idx_reservation_active_window_type";
DROP INDEX IF EXISTS "idx_reservation_active_window_slot";
