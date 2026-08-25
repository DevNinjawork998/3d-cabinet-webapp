-- AlterTable
ALTER TABLE "CabinetDesign" ADD COLUMN     "familyId" TEXT;

-- CreateIndex
CREATE INDEX "CabinetDesign_familyId_idx" ON "CabinetDesign"("familyId");
