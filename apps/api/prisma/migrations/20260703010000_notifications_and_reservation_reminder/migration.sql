-- Add reservation reminder tracking and persisted driver notifications.

CREATE TYPE "NotificationType" AS ENUM (
  'session_started',
  'reservation_expiring_soon'
);

ALTER TABLE "reservations"
ADD COLUMN "reminded_at" TIMESTAMPTZ(3);

CREATE TABLE "notifications" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "type" "NotificationType" NOT NULL,
  "title" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "related_reservation_id" TEXT,
  "related_session_id" TEXT,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "read_at" TIMESTAMPTZ(3),

  CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_notifications_user_created"
ON "notifications"("user_id", "created_at");

CREATE INDEX "idx_notifications_user_read"
ON "notifications"("user_id", "read_at");

ALTER TABLE "notifications"
ADD CONSTRAINT "notifications_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
