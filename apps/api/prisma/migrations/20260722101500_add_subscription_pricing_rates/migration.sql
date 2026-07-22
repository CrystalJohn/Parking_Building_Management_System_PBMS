-- Add subscription prices required by the current PricingConfig Prisma model.
-- Defaults keep existing production pricing rows valid during the migration.
ALTER TABLE "pricing_configs"
  ADD COLUMN "monthly_rate" INTEGER NOT NULL DEFAULT 300000,
  ADD COLUMN "yearly_rate" INTEGER NOT NULL DEFAULT 3000000;
