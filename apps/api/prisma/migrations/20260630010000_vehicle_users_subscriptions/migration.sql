CREATE TYPE "VehicleUserRole" AS ENUM ('owner', 'driver');

CREATE TYPE "SubscriptionPlanType" AS ENUM ('casual', 'monthly', 'yearly');

ALTER TABLE "users"
ADD COLUMN "email" TEXT;

CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

CREATE TABLE "vehicles" (
  "id" TEXT NOT NULL,
  "plate_number" TEXT NOT NULL,
  "vehicle_type" "VehicleType" NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "registered_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "vehicles_plate_number_key" ON "vehicles"("plate_number");
CREATE INDEX "idx_vehicle_type_active" ON "vehicles"("vehicle_type", "is_active");

CREATE TABLE "vehicle_users" (
  "vehicle_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "role" "VehicleUserRole" NOT NULL DEFAULT 'driver',
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "vehicle_users_pkey" PRIMARY KEY ("vehicle_id", "user_id")
);

CREATE INDEX "idx_vehicle_users_user" ON "vehicle_users"("user_id");
CREATE INDEX "idx_vehicle_users_vehicle_role" ON "vehicle_users"("vehicle_id", "role");

CREATE TABLE "subscriptions" (
  "id" TEXT NOT NULL,
  "vehicle_id" TEXT NOT NULL,
  "plan_type" "SubscriptionPlanType" NOT NULL,
  "valid_from" TIMESTAMPTZ(3) NOT NULL,
  "valid_to" TIMESTAMPTZ(3) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_subscriptions_vehicle_window" ON "subscriptions"("vehicle_id", "valid_from", "valid_to");

ALTER TABLE "parking_sessions"
ADD COLUMN "vehicle_id" TEXT,
ADD COLUMN "plate_number_ocr" TEXT,
ADD COLUMN "plate_number_confirmed" TEXT;

CREATE INDEX "idx_session_vehicle" ON "parking_sessions"("vehicle_id");
CREATE INDEX "idx_session_confirmed_plate_status" ON "parking_sessions"("plate_number_confirmed", "status");

ALTER TABLE "vehicle_users"
ADD CONSTRAINT "vehicle_users_vehicle_id_fkey"
FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "vehicle_users"
ADD CONSTRAINT "vehicle_users_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "subscriptions"
ADD CONSTRAINT "subscriptions_vehicle_id_fkey"
FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "parking_sessions"
ADD CONSTRAINT "parking_sessions_vehicle_id_fkey"
FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
