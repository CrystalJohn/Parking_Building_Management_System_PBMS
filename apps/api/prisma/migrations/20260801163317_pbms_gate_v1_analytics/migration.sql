-- AlterTable
ALTER TABLE "gate_audit_logs" ADD COLUMN     "confidence" DOUBLE PRECISION,
ADD COLUMN     "source" TEXT,
ADD COLUMN     "was_corrected" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "ocr_evidences" ADD COLUMN     "was_corrected" BOOLEAN NOT NULL DEFAULT false;
