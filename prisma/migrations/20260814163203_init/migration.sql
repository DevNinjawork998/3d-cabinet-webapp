-- CreateEnum
CREATE TYPE "Product" AS ENUM ('WARDROBE', 'PLANNER');

-- CreateEnum
CREATE TYPE "CatalogueStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'SUPERSEDED', 'DISCARDED');

-- CreateTable
CREATE TABLE "CatalogueImport" (
    "id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "blobUrl" TEXT NOT NULL,
    "blobPathname" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "sourceVersion" TEXT NOT NULL,
    "draft" JSONB NOT NULL,
    "warnings" TEXT[],
    "uploadedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CatalogueImport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CatalogueVersion" (
    "id" TEXT NOT NULL,
    "product" "Product" NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "CatalogueStatus" NOT NULL DEFAULT 'DRAFT',
    "data" JSONB NOT NULL,
    "note" TEXT,
    "importId" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "publishedBy" TEXT,
    "publishedAt" TIMESTAMP(3),

    CONSTRAINT "CatalogueVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CatalogueImport_sha256_key" ON "CatalogueImport"("sha256");

-- CreateIndex
CREATE INDEX "CatalogueVersion_product_status_idx" ON "CatalogueVersion"("product", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogueVersion_product_version_key" ON "CatalogueVersion"("product", "version");

-- AddForeignKey
ALTER TABLE "CatalogueVersion" ADD CONSTRAINT "CatalogueVersion_importId_fkey" FOREIGN KEY ("importId") REFERENCES "CatalogueImport"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Enforce "an unpublished catalogue version can never affect live pricing":
-- at most one PUBLISHED row per product. Prisma's schema language can't
-- express a partial unique index, so this is hand-written (see the
-- DB-backed-catalogue plan).
CREATE UNIQUE INDEX "CatalogueVersion_one_published_per_product"
  ON "CatalogueVersion" ("product") WHERE "status" = 'PUBLISHED';
