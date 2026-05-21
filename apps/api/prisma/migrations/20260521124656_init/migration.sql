-- CreateEnum
CREATE TYPE "Role" AS ENUM ('admin', 'manager', 'staff', 'driver');

-- CreateEnum
CREATE TYPE "Zone" AS ENUM ('A', 'B');

-- CreateEnum
CREATE TYPE "VehicleType" AS ENUM ('car', 'motorbike');

-- CreateEnum
CREATE TYPE "SlotStatus" AS ENUM ('available', 'occupied', 'reserved', 'maintenance');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('active', 'completed', 'cancelled');

-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('active', 'fulfilled', 'expired', 'cancelled');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('cash');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "full_name" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "floors" (
    "id" SERIAL NOT NULL,
    "floor_number" INTEGER NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "floors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "slots" (
    "id" SERIAL NOT NULL,
    "floor_id" INTEGER NOT NULL,
    "zone" "Zone" NOT NULL,
    "slot_number" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "status" "SlotStatus" NOT NULL DEFAULT 'available',
    "vehicle_type" "VehicleType" NOT NULL,

    CONSTRAINT "slots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parking_sessions" (
    "id" TEXT NOT NULL,
    "driver_id" TEXT,
    "slot_id" INTEGER NOT NULL,
    "reservation_id" TEXT,
    "license_plate" TEXT NOT NULL,
    "vehicle_type" "VehicleType" NOT NULL,
    "check_in_time" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "check_out_time" TIMESTAMP(3),
    "status" "SessionStatus" NOT NULL DEFAULT 'active',
    "qr_code" TEXT,
    "fee_amount" INTEGER NOT NULL DEFAULT 0,
    "penalty_amount" INTEGER NOT NULL DEFAULT 0,
    "is_paid" BOOLEAN NOT NULL DEFAULT false,
    "is_overtime" BOOLEAN NOT NULL DEFAULT false,
    "is_lost_ticket" BOOLEAN NOT NULL DEFAULT false,
    "id_card_no" TEXT,
    "driver_license_no" TEXT,
    "is_synthetic" BOOLEAN NOT NULL DEFAULT false,
    "checked_in_by" TEXT,
    "checked_out_by" TEXT,
    "allocation_strategy" TEXT,
    "allocation_time_ms" INTEGER,

    CONSTRAINT "parking_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reservations" (
    "id" TEXT NOT NULL,
    "driver_id" TEXT NOT NULL,
    "slot_id" INTEGER NOT NULL,
    "vehicle_type" "VehicleType" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "status" "ReservationStatus" NOT NULL DEFAULT 'active',

    CONSTRAINT "reservations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "method" "PaymentMethod" NOT NULL DEFAULT 'cash',
    "paid_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "received_by" TEXT NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pricing_configs" (
    "id" SERIAL NOT NULL,
    "vehicle_type" "VehicleType" NOT NULL,
    "hourly_rate" INTEGER NOT NULL,
    "overtime_penalty" INTEGER NOT NULL,
    "lost_ticket_penalty" INTEGER NOT NULL,
    "overtime_threshold_hours" INTEGER NOT NULL DEFAULT 24,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT,

    CONSTRAINT "pricing_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_configs" (
    "id" SERIAL NOT NULL,
    "config_key" TEXT NOT NULL,
    "config_value" TEXT NOT NULL,
    "description" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" VARCHAR(100),

    CONSTRAINT "system_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "simulation_runs" (
    "id" TEXT NOT NULL,
    "strategy" TEXT NOT NULL,
    "scenario" TEXT NOT NULL,
    "params" JSONB,
    "seed" BIGINT,
    "avg_search_time_ms" DOUBLE PRECISION,
    "avg_walking_time_ms" DOUBLE PRECISION,
    "final_utilization_rate" DOUBLE PRECISION,
    "mismatch_rate" DOUBLE PRECISION,
    "rejection_count" INTEGER,
    "overflow_count" INTEGER,
    "total_vehicles" INTEGER,
    "duration_minutes" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" VARCHAR(100),

    CONSTRAINT "simulation_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "floors_floor_number_key" ON "floors"("floor_number");

-- CreateIndex
CREATE UNIQUE INDEX "slots_code_key" ON "slots"("code");

-- CreateIndex
CREATE INDEX "idx_slot_status_type" ON "slots"("status", "vehicle_type");

-- CreateIndex
CREATE UNIQUE INDEX "parking_sessions_reservation_id_key" ON "parking_sessions"("reservation_id");

-- CreateIndex
CREATE INDEX "idx_session_plate_status" ON "parking_sessions"("license_plate", "status");

-- CreateIndex
CREATE INDEX "idx_session_checkout_time" ON "parking_sessions"("check_out_time");

-- CreateIndex
CREATE INDEX "idx_active_sessions_by_driver" ON "parking_sessions"("driver_id");

-- CreateIndex
CREATE INDEX "idx_session_reservation" ON "parking_sessions"("reservation_id");

-- CreateIndex
CREATE INDEX "idx_reservation_active" ON "reservations"("status", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "payments_session_id_key" ON "payments"("session_id");

-- CreateIndex
CREATE UNIQUE INDEX "system_configs_config_key_key" ON "system_configs"("config_key");

-- CreateIndex
CREATE INDEX "idx_simrun_strategy_scenario" ON "simulation_runs"("strategy", "scenario");

-- AddForeignKey
ALTER TABLE "slots" ADD CONSTRAINT "slots_floor_id_fkey" FOREIGN KEY ("floor_id") REFERENCES "floors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parking_sessions" ADD CONSTRAINT "parking_sessions_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parking_sessions" ADD CONSTRAINT "parking_sessions_slot_id_fkey" FOREIGN KEY ("slot_id") REFERENCES "slots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parking_sessions" ADD CONSTRAINT "parking_sessions_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "reservations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parking_sessions" ADD CONSTRAINT "parking_sessions_checked_in_by_fkey" FOREIGN KEY ("checked_in_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parking_sessions" ADD CONSTRAINT "parking_sessions_checked_out_by_fkey" FOREIGN KEY ("checked_out_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_slot_id_fkey" FOREIGN KEY ("slot_id") REFERENCES "slots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "parking_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_received_by_fkey" FOREIGN KEY ("received_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pricing_configs" ADD CONSTRAINT "pricing_configs_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Custom partial indexes (not supported by Prisma schema syntax)

-- Q8: One license plate cannot have two active sessions simultaneously
CREATE UNIQUE INDEX "uniq_active_plate"
  ON "parking_sessions" ("license_plate")
  WHERE "status" = 'active';

-- Partial index for active reservations lookup (sweeper performance)
CREATE INDEX "idx_reservation_active_partial"
  ON "reservations" ("status", "expires_at")
  WHERE "status" = 'active';
