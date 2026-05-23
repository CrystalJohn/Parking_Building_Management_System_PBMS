-- AlterTable
ALTER TABLE "parking_sessions" ADD COLUMN     "floor_id" INTEGER,
ADD COLUMN     "zone" "Zone";

-- CreateIndex
CREATE INDEX "idx_session_strategy" ON "parking_sessions"("allocation_strategy");
