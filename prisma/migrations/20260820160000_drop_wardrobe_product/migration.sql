-- Drops the WARDROBE member of the Product enum.
--
-- The wardrobe configurator (`/viewer`, `lib/wardrobe`, `components/configurator`)
-- was superseded by the planner and has been deleted, so nothing consumes a
-- published wardrobe catalogue any more. Postgres cannot DROP VALUE from an
-- enum in place, hence the type swap below.
--
-- DESTRUCTIVE: this deletes every CatalogueVersion row for WARDROBE, and any
-- CatalogueImport row left with no remaining version. Run against a copy and
-- confirm the row counts before applying to production.

BEGIN;

-- 1. Rows must go before the enum value they reference can.
DELETE FROM "CatalogueVersion" WHERE "product" = 'WARDROBE';

-- 2. Sweep imports orphaned by that delete. `importId` is ON DELETE SET NULL,
--    so these are rows no version points at any more.
DELETE FROM "CatalogueImport"
WHERE NOT EXISTS (
  SELECT 1 FROM "CatalogueVersion" v WHERE v."importId" = "CatalogueImport"."id"
);

-- 3. The hand-written partial unique index is ON ("product") — the column being
--    retyped. Dropped explicitly and recreated below rather than trusting the
--    implicit rebuild, so its survival is visible in this file.
DROP INDEX IF EXISTS "CatalogueVersion_one_published_per_product";

-- 4. Swap the enum type.
CREATE TYPE "Product_new" AS ENUM ('PLANNER');
ALTER TABLE "CatalogueVersion"
  ALTER COLUMN "product" TYPE "Product_new"
  USING ("product"::text::"Product_new");
ALTER TYPE "Product" RENAME TO "Product_old";
ALTER TYPE "Product_new" RENAME TO "Product";
DROP TYPE "Product_old";

-- 5. Recreate the partial unique index: at most one PUBLISHED row per product.
CREATE UNIQUE INDEX "CatalogueVersion_one_published_per_product"
  ON "CatalogueVersion" ("product") WHERE "status" = 'PUBLISHED';

COMMIT;
