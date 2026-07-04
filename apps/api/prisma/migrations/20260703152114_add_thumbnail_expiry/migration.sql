-- AlterTable
ALTER TABLE "ocr_evidences" ADD COLUMN     "thumbnail_deleted_at" TIMESTAMPTZ(3),
ADD COLUMN     "thumbnail_expires_at" TIMESTAMPTZ(3);
