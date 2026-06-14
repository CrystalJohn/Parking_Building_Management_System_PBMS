-- DropForeignKey
ALTER TABLE "payments" DROP CONSTRAINT "payments_received_by_fkey";

-- AlterTable
ALTER TABLE "payments" ALTER COLUMN "paid_at" DROP DEFAULT;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_received_by_fkey" FOREIGN KEY ("received_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
