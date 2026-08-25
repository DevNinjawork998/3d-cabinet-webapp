-- AlterTable
ALTER TABLE "CabinetDesign" ADD COLUMN     "meshBytes" INTEGER,
ADD COLUMN     "meshGroups" JSONB,
ADD COLUMN     "meshPathname" TEXT;
