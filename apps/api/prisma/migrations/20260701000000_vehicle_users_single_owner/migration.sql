DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "vehicle_users"
    WHERE "role" = 'owner'
    GROUP BY "vehicle_id"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot enforce single vehicle owner: duplicate owner links exist in vehicle_users';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "vehicle_users_single_owner_idx"
ON "vehicle_users" ("vehicle_id")
WHERE "role" = 'owner';
