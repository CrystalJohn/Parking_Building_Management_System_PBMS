/*
  Warnings:

  - A unique constraint covering the columns `[subscription_id]` on the table `payments` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('pending', 'active', 'expired', 'cancelled');

-- DropForeignKey
ALTER TABLE "payments" DROP CONSTRAINT "payments_session_id_fkey";

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "subscription_id" TEXT,
ALTER COLUMN "session_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "subscriptions" ADD COLUMN     "created_by" TEXT,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "status" "SubscriptionStatus" NOT NULL DEFAULT 'pending',
ALTER COLUMN "valid_from" DROP NOT NULL,
ALTER COLUMN "valid_to" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "payments_subscription_id_key" ON "payments"("subscription_id");

-- CreateIndex
CREATE INDEX "idx_subscription_valid_to" ON "subscriptions"("valid_to");

-- CreateIndex
CREATE INDEX "idx_subscription_vehicle_status" ON "subscriptions"("vehicle_id", "status");

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "parking_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
