ALTER TABLE "slots"
ADD COLUMN IF NOT EXISTS "walking_distance" INTEGER NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS "uniq_active_plate"
ON "parking_sessions" ("license_plate")
WHERE "status" = 'active';
