-- AlterTable
ALTER TABLE "Delivery" ADD COLUMN     "pickupGeocodedFor" TEXT,
ADD COLUMN     "pickupLat" DOUBLE PRECISION,
ADD COLUMN     "pickupLng" DOUBLE PRECISION,
ADD COLUMN     "siteGeocodedFor" TEXT,
ADD COLUMN     "siteLat" DOUBLE PRECISION,
ADD COLUMN     "siteLng" DOUBLE PRECISION;
