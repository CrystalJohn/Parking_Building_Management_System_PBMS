-- CreateEnum
CREATE TYPE "GateType" AS ENUM ('CHECK_IN', 'CHECK_OUT');

-- AlterTable
ALTER TABLE "gate_lanes" ADD COLUMN     "gate_id" TEXT;

-- CreateTable
CREATE TABLE "gates" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "gate_type" "GateType" NOT NULL,
    "floor_id" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "gates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "gates_code_key" ON "gates"("code");

-- CreateIndex
CREATE INDEX "idx_gates_type_active" ON "gates"("gate_type", "is_active");

-- AddForeignKey
ALTER TABLE "gates" ADD CONSTRAINT "gates_floor_id_fkey" FOREIGN KEY ("floor_id") REFERENCES "floors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gate_lanes" ADD CONSTRAINT "gate_lanes_gate_id_fkey" FOREIGN KEY ("gate_id") REFERENCES "gates"("id") ON DELETE SET NULL ON UPDATE CASCADE;
