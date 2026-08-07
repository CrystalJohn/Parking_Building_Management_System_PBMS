/*
  Warnings:

  - You are about to drop the column `confidence` on the `gate_audit_logs` table. All the data in the column will be lost.
  - You are about to drop the column `source` on the `gate_audit_logs` table. All the data in the column will be lost.
  - You are about to drop the column `was_corrected` on the `gate_audit_logs` table. All the data in the column will be lost.
  - Added the required column `plate_display` to the `gate_audit_logs` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "gate_audit_logs" DROP COLUMN "confidence",
DROP COLUMN "source",
DROP COLUMN "was_corrected",
ADD COLUMN     "plate_display" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "ocr_evidences" ADD COLUMN     "plate_image_url" TEXT,
ADD COLUMN     "vehicle_image_url" TEXT;
