-- Flow 4B: nullable provider metadata for Bank QR / PayOS payments.
-- All columns are nullable so existing cash payments remain valid.

ALTER TABLE "payments"
  ADD COLUMN "provider" TEXT,
  ADD COLUMN "provider_ref" TEXT,
  ADD COLUMN "provider_order_code" TEXT,
  ADD COLUMN "checkout_url" TEXT,
  ADD COLUMN "qr_code" TEXT,
  ADD COLUMN "expired_at" TIMESTAMPTZ(3),
  ADD COLUMN "provider_payload" JSONB;

CREATE INDEX "idx_payment_provider_order_code" ON "payments"("provider_order_code");
CREATE INDEX "idx_payment_provider_ref" ON "payments"("provider_ref");
