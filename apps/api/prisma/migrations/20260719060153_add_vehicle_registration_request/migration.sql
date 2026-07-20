-- CreateEnum
CREATE TYPE "VehicleRegistrationStatus" AS ENUM ('pending', 'approved', 'rejected', 'expired');

-- CreateTable
CREATE TABLE "vehicle_registration_requests" (
    "id" TEXT NOT NULL,
    "driver_id" TEXT NOT NULL,
    "plate_number" TEXT NOT NULL,
    "vehicle_type" "VehicleType" NOT NULL,
    "status" "VehicleRegistrationStatus" NOT NULL DEFAULT 'pending',
    "reviewed_by_id" TEXT,
    "reviewed_at" TIMESTAMPTZ(3),
    "reject_reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "vehicle_registration_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_vehicle_registration_status" ON "vehicle_registration_requests"("status", "created_at");

-- CreateIndex
CREATE INDEX "idx_vehicle_registration_driver" ON "vehicle_registration_requests"("driver_id");

-- AddForeignKey
ALTER TABLE "vehicle_registration_requests" ADD CONSTRAINT "vehicle_registration_requests_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_registration_requests" ADD CONSTRAINT "vehicle_registration_requests_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
