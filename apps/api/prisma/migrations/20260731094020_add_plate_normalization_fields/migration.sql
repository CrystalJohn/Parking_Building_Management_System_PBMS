-- AlterTable
ALTER TABLE "ocr_evidences" ADD COLUMN     "canonical_plate" TEXT,
ADD COLUMN     "display_plate" TEXT,
ADD COLUMN     "raw_plate" TEXT;

-- AlterTable
ALTER TABLE "parking_sessions" ADD COLUMN     "plate_display" TEXT;

-- AlterTable
ALTER TABLE "vehicles" ADD COLUMN     "plate_display" TEXT;
