-- CreateTable
CREATE TABLE "gate_lanes" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "vehicle_type" "VehicleType" NOT NULL,
    "camera_id" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "gate_lanes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "gate_lanes_code_key" ON "gate_lanes"("code");
CREATE INDEX "idx_gate_lanes_type_active" ON "gate_lanes"("vehicle_type", "is_active");

-- CreateTable
CREATE TABLE "staff_gate_assignments" (
    "staff_id" TEXT NOT NULL,
    "gate_lane_id" TEXT NOT NULL,
    "assigned_by_id" TEXT NOT NULL,
    "assigned_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "staff_gate_assignments_pkey" PRIMARY KEY ("staff_id")
);

CREATE INDEX "idx_gate_assignments_lane" ON "staff_gate_assignments"("gate_lane_id");

ALTER TABLE "staff_gate_assignments"
  ADD CONSTRAINT "staff_gate_assignments_staff_id_fkey"
  FOREIGN KEY ("staff_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "staff_gate_assignments"
  ADD CONSTRAINT "staff_gate_assignments_gate_lane_id_fkey"
  FOREIGN KEY ("gate_lane_id") REFERENCES "gate_lanes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "staff_gate_assignments"
  ADD CONSTRAINT "staff_gate_assignments_assigned_by_id_fkey"
  FOREIGN KEY ("assigned_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
