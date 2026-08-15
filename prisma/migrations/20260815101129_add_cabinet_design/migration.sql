-- CreateEnum
CREATE TYPE "CabinetCategory" AS ENUM ('BASE_CABINET', 'WALL_CABINET', 'TALL_CABINET', 'DRAWER_BASE', 'FRIDGE_HOUSING');

-- CreateEnum
CREATE TYPE "CabinetRoom" AS ENUM ('KITCHEN', 'LIVING_ROOM', 'BEDROOM', 'FOYER');

-- CreateEnum
CREATE TYPE "CabinetDesignStatus" AS ENUM ('PUBLISHED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "CabinetDesign" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "blobUrl" TEXT NOT NULL,
    "blobPathname" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "category" "CabinetCategory" NOT NULL,
    "room" "CabinetRoom" NOT NULL,
    "widthMm" INTEGER NOT NULL,
    "heightMm" INTEGER NOT NULL,
    "depthMm" INTEGER NOT NULL,
    "priceRm" DOUBLE PRECISION NOT NULL,
    "sku" TEXT NOT NULL,
    "description" TEXT,
    "tags" TEXT,
    "finishes" TEXT[],
    "status" "CabinetDesignStatus" NOT NULL DEFAULT 'PUBLISHED',
    "uploadedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CabinetDesign_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CabinetDesign_sha256_key" ON "CabinetDesign"("sha256");

-- CreateIndex
CREATE UNIQUE INDEX "CabinetDesign_sku_key" ON "CabinetDesign"("sku");

-- CreateIndex
CREATE INDEX "CabinetDesign_status_idx" ON "CabinetDesign"("status");
