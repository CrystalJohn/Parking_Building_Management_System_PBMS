-- CreateEnum
CREATE TYPE "OcrEventType" AS ENUM ('check_in', 'check_out');

-- AlterTable
ALTER TABLE "ocr_evidences" ADD COLUMN     "event_type" "OcrEventType" NOT NULL DEFAULT 'check_in',
ADD COLUMN     "image_deleted_at" TIMESTAMPTZ(3),
ADD COLUMN     "image_expires_at" TIMESTAMPTZ(3),
ADD COLUMN     "image_key" TEXT,
ADD COLUMN     "image_mime_type" TEXT,
ADD COLUMN     "image_sha256" TEXT,
ADD COLUMN     "image_size_bytes" INTEGER,
ADD COLUMN     "thumbnail_key" TEXT;
