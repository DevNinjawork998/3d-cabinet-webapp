-- CreateEnum
CREATE TYPE "TutorialStatus" AS ENUM ('PROCESSING', 'READY', 'ERRORED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "Tutorial" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "muxUploadId" TEXT NOT NULL,
    "muxAssetId" TEXT,
    "playbackId" TEXT,
    "durationSec" INTEGER,
    "status" "TutorialStatus" NOT NULL DEFAULT 'PROCESSING',
    "uploadedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tutorial_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tutorial_muxUploadId_key" ON "Tutorial"("muxUploadId");

-- CreateIndex
CREATE INDEX "Tutorial_status_sortOrder_idx" ON "Tutorial"("status", "sortOrder");
