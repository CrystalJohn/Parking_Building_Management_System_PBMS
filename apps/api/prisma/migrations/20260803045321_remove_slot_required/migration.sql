-- DropForeignKey
ALTER TABLE "parking_sessions" DROP CONSTRAINT "parking_sessions_slot_id_fkey";

-- AlterTable
ALTER TABLE "parking_sessions" ADD COLUMN     "check_out_lane_id" TEXT,
ALTER COLUMN "slot_id" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "parking_sessions" ADD CONSTRAINT "parking_sessions_slot_id_fkey" FOREIGN KEY ("slot_id") REFERENCES "slots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parking_sessions" ADD CONSTRAINT "parking_sessions_check_out_lane_id_fkey" FOREIGN KEY ("check_out_lane_id") REFERENCES "gate_lanes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
