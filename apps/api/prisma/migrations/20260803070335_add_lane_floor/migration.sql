-- AlterTable
ALTER TABLE "gate_lanes" ADD COLUMN     "floor_id" INTEGER;

-- AddForeignKey
ALTER TABLE "gate_lanes" ADD CONSTRAINT "gate_lanes_floor_id_fkey" FOREIGN KEY ("floor_id") REFERENCES "floors"("id") ON DELETE SET NULL ON UPDATE CASCADE;
