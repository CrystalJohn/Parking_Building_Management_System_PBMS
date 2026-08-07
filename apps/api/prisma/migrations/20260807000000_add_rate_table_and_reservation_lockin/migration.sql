-- CreateEnum
CREATE TYPE "RateTableType" AS ENUM ('DEFAULT', 'EVENT');

-- CreateTable: RateTable
CREATE TABLE "rate_tables" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "type" "RateTableType" NOT NULL,
    "vehicle_type" "VehicleType" NOT NULL,
    "hourly_rate" INTEGER NOT NULL,
    "effective_from" TIMESTAMPTZ(3),
    "effective_to" TIMESTAMPTZ(3),
    "priority" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "rate_tables_pkey" PRIMARY KEY ("id")
);

-- BR-01: exactly one DEFAULT per vehicleType (partial unique index)
CREATE UNIQUE INDEX "uq_rate_table_default_per_vehicle" ON "rate_tables" ("vehicle_type") WHERE "type" = 'DEFAULT';

-- Indexes for rate resolution queries
CREATE INDEX "idx_rate_table_type_vehicle" ON "rate_tables"("type", "vehicle_type", "is_active");
CREATE INDEX "idx_rate_table_effective_range" ON "rate_tables"("type", "vehicle_type", "effective_from", "effective_to");

-- AddForeignKey: RateTable → User (createdBy)
ALTER TABLE "rate_tables" ADD CONSTRAINT "rate_tables_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Add snapshot fields to Reservation (BR-09)
ALTER TABLE "reservations" ADD COLUMN "estimated_cost" INTEGER,
    ADD COLUMN "locked_rate_table_id" TEXT,
    ADD COLUMN "locked_hourly_rate" INTEGER,
    ADD COLUMN "priced_at" TIMESTAMPTZ(3);

-- AddForeignKey: Reservation → RateTable (locked)
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_locked_rate_table_id_fkey" FOREIGN KEY ("locked_rate_table_id") REFERENCES "rate_tables"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Migrate data: create DEFAULT rate tables from existing PricingConfig hourlyRate
INSERT INTO "rate_tables" ("id", "name", "type", "vehicle_type", "hourly_rate", "is_active", "created_by", "created_at", "updated_at")
SELECT
    gen_random_uuid()::text,
    NULL,
    'DEFAULT',
    "vehicle_type",
    "hourly_rate",
    true,
    (SELECT "id" FROM "users" WHERE "role" = 'manager' LIMIT 1),
    NOW(),
    NOW()
FROM "pricing_configs";

-- Drop hourly_rate from PricingConfig (moved to RateTable)
ALTER TABLE "pricing_configs" DROP COLUMN "hourly_rate";
