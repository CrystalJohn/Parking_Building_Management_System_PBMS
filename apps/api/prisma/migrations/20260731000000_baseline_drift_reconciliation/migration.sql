-- AlterTable
ALTER TABLE "pricing_configs" ADD COLUMN     "reservation_discount_percent" INTEGER NOT NULL DEFAULT 20;

-- AlterTable
ALTER TABLE "vehicle_registration_requests" DROP COLUMN "evidence_url",
ADD COLUMN     "evidence_url_ca_vant" TEXT,
ADD COLUMN     "evidence_url_overall" TEXT,
ADD COLUMN     "evidence_url_plate" TEXT;

-- CreateIndex
CREATE INDEX "idx_session_status" ON "parking_sessions"("status");

-- CreateIndex
CREATE INDEX "idx_session_status_checkin" ON "parking_sessions"("status", "check_in_time");

-- CreateIndex
CREATE INDEX "idx_session_checkin_time" ON "parking_sessions"("check_in_time");

-- CreateIndex
CREATE INDEX "idx_payment_status" ON "payments"("status");

-- CreateIndex
CREATE INDEX "idx_payment_status_paid_at" ON "payments"("status", "paid_at");
