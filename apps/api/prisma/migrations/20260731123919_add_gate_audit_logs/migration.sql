-- CreateTable
CREATE TABLE "gate_audit_logs" (
    "id" TEXT NOT NULL,
    "staff_id" TEXT NOT NULL,
    "canonical_plate" TEXT NOT NULL,
    "vehicle_status" TEXT NOT NULL,
    "recommended_action" TEXT NOT NULL,
    "actual_action" TEXT NOT NULL,
    "reason" TEXT,
    "session_id" TEXT,
    "reservation_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gate_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_gate_audit_staff" ON "gate_audit_logs"("staff_id", "created_at");

-- CreateIndex
CREATE INDEX "idx_gate_audit_plate" ON "gate_audit_logs"("canonical_plate", "created_at");
