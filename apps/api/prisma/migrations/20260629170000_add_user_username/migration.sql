ALTER TABLE "users" ADD COLUMN "username" TEXT;

CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

UPDATE "users"
SET "username" = 'admin'
WHERE "phone" = '0900000001' AND "username" IS NULL;

UPDATE "users"
SET "username" = 'manager'
WHERE "phone" = '0900000002' AND "username" IS NULL;

UPDATE "users"
SET "username" = 'staff'
WHERE "phone" = '0900000003' AND "username" IS NULL;
