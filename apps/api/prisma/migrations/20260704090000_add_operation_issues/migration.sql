CREATE TYPE "OperationIssueType" AS ENUM (
  'lost_ticket_review',
  'payment_issue',
  'ocr_mismatch',
  'reservation_exception',
  'slot_state_mismatch',
  'manual_review'
);

CREATE TYPE "OperationIssueSeverity" AS ENUM ('critical', 'warning', 'info');

CREATE TYPE "OperationIssueStatus" AS ENUM ('open', 'in_review', 'resolved', 'dismissed');

CREATE TYPE "OperationIssueSource" AS ENUM ('staff', 'system');

CREATE TABLE "operation_issues" (
  "id" TEXT NOT NULL,
  "type" "OperationIssueType" NOT NULL,
  "severity" "OperationIssueSeverity" NOT NULL DEFAULT 'warning',
  "status" "OperationIssueStatus" NOT NULL DEFAULT 'open',
  "source" "OperationIssueSource" NOT NULL DEFAULT 'staff',
  "note" TEXT NOT NULL,
  "resolution_note" TEXT,
  "plate_number" TEXT,
  "session_id" TEXT,
  "reservation_id" TEXT,
  "payment_id" TEXT,
  "slot_id" INTEGER,
  "created_by_id" TEXT,
  "reviewed_by_id" TEXT,
  "reviewed_at" TIMESTAMPTZ(3),
  "resolved_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "operation_issues_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "operation_issues"
  ADD CONSTRAINT "operation_issues_session_id_fkey"
  FOREIGN KEY ("session_id") REFERENCES "parking_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "operation_issues"
  ADD CONSTRAINT "operation_issues_reservation_id_fkey"
  FOREIGN KEY ("reservation_id") REFERENCES "reservations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "operation_issues"
  ADD CONSTRAINT "operation_issues_payment_id_fkey"
  FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "operation_issues"
  ADD CONSTRAINT "operation_issues_slot_id_fkey"
  FOREIGN KEY ("slot_id") REFERENCES "slots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "operation_issues"
  ADD CONSTRAINT "operation_issues_created_by_id_fkey"
  FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "operation_issues"
  ADD CONSTRAINT "operation_issues_reviewed_by_id_fkey"
  FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "idx_operation_issues_queue" ON "operation_issues"("status", "severity", "created_at");
CREATE INDEX "idx_operation_issues_type_status" ON "operation_issues"("type", "status");
CREATE INDEX "idx_operation_issues_session" ON "operation_issues"("session_id");
CREATE INDEX "idx_operation_issues_reservation" ON "operation_issues"("reservation_id");
CREATE INDEX "idx_operation_issues_payment" ON "operation_issues"("payment_id");
CREATE INDEX "idx_operation_issues_slot" ON "operation_issues"("slot_id");
