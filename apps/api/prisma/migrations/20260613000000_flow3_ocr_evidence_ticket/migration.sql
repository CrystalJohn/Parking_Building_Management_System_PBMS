ALTER TABLE "parking_sessions"
  ADD COLUMN "session_code" TEXT,
  ADD COLUMN "ticket_generated_at" TIMESTAMPTZ(3),
  ADD COLUMN "ticket_issued_at" TIMESTAMPTZ(3),
  ADD COLUMN "ticket_issued_by_staff_id" TEXT;

CREATE UNIQUE INDEX "parking_sessions_session_code_key" ON "parking_sessions"("session_code");

ALTER TABLE "parking_sessions"
  ADD CONSTRAINT "parking_sessions_ticket_issued_by_staff_id_fkey"
  FOREIGN KEY ("ticket_issued_by_staff_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "ocr_evidences" (
  "id" TEXT NOT NULL,
  "provider" TEXT NOT NULL DEFAULT 'PLATE_RECOGNIZER',
  "provider_filename" TEXT,
  "provider_timestamp" TIMESTAMPTZ(3),
  "camera_id" TEXT,
  "raw_response" JSONB,
  "plate_box" JSONB,
  "ocr_plate" TEXT,
  "ocr_confidence" DOUBLE PRECISION,
  "confirmed_plate" TEXT,
  "vehicle_type" TEXT,
  "building_name" TEXT,
  "gate_name" TEXT,
  "error_message" TEXT,
  "captured_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "check_in_time" TIMESTAMPTZ(3),
  "staff_id" TEXT,
  "reservation_id" TEXT,
  "session_id" TEXT,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "ocr_evidences_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_ocr_evidence_session" ON "ocr_evidences"("session_id");
CREATE INDEX "idx_ocr_evidence_reservation" ON "ocr_evidences"("reservation_id");
CREATE INDEX "idx_ocr_evidence_staff" ON "ocr_evidences"("staff_id");
CREATE INDEX "idx_ocr_evidence_captured_at" ON "ocr_evidences"("captured_at");

ALTER TABLE "ocr_evidences"
  ADD CONSTRAINT "ocr_evidences_staff_id_fkey"
  FOREIGN KEY ("staff_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ocr_evidences"
  ADD CONSTRAINT "ocr_evidences_reservation_id_fkey"
  FOREIGN KEY ("reservation_id") REFERENCES "reservations"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ocr_evidences"
  ADD CONSTRAINT "ocr_evidences_session_id_fkey"
  FOREIGN KEY ("session_id") REFERENCES "parking_sessions"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
