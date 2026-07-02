ALTER TABLE "reservations"
ADD COLUMN "vehicle_id" TEXT;

CREATE INDEX "idx_reservation_vehicle"
ON "reservations" ("vehicle_id");

ALTER TABLE "reservations"
ADD CONSTRAINT "reservations_vehicle_id_fkey"
FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
