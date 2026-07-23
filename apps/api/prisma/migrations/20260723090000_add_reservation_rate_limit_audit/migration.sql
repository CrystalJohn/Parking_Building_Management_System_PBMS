ALTER TABLE "reservations" ADD COLUMN "cancelled_at" TIMESTAMPTZ(3);

CREATE INDEX "idx_reservation_driver_created" ON "reservations"("driver_id", "created_at");

CREATE INDEX "idx_reservation_driver_cancelled" ON "reservations"("driver_id", "cancelled_at");
