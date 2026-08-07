-- AlterTable
ALTER TABLE "ocr_evidences" ADD COLUMN     "auto_reconciled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "parking_sessions" ADD COLUMN     "identification_method" TEXT;
