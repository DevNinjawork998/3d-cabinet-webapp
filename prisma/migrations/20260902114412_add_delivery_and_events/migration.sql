-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('DRAFT', 'QUOTED', 'BOOKED', 'DRIVER_ASSIGNED', 'PICKED_UP', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED', 'FAILED');

-- CreateEnum
CREATE TYPE "DeliveryEventSource" AS ENUM ('ADMIN', 'CARRIER_WEBHOOK', 'POLL');

-- CreateTable
CREATE TABLE "Delivery" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "customerName" TEXT NOT NULL,
    "customerPhone" TEXT NOT NULL,
    "siteAddress" TEXT NOT NULL,
    "addressNotes" TEXT,
    "pickupAddress" TEXT NOT NULL,
    "items" JSONB NOT NULL DEFAULT '[]',
    "totalWeightKg" DOUBLE PRECISION,
    "totalVolumeM3" DOUBLE PRECISION,
    "scheduledAt" TIMESTAMP(3),
    "carrierId" TEXT,
    "status" "DeliveryStatus" NOT NULL DEFAULT 'DRAFT',
    "quotedPriceRm" DOUBLE PRECISION,
    "carrierOrderId" TEXT,
    "trackingUrl" TEXT,
    "driverName" TEXT,
    "driverPhone" TEXT,
    "vehiclePlate" TEXT,
    "lastLatitude" DOUBLE PRECISION,
    "lastLongitude" DOUBLE PRECISION,
    "lastLocationAt" TIMESTAMP(3),
    "bookedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Delivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryEvent" (
    "id" TEXT NOT NULL,
    "deliveryId" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" "DeliveryEventSource" NOT NULL,
    "status" "DeliveryStatus",
    "message" TEXT NOT NULL,
    "actor" TEXT,
    "raw" JSONB,

    CONSTRAINT "DeliveryEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Delivery_number_key" ON "Delivery"("number");

-- CreateIndex
CREATE UNIQUE INDEX "Delivery_carrierOrderId_key" ON "Delivery"("carrierOrderId");

-- CreateIndex
CREATE INDEX "Delivery_status_scheduledAt_idx" ON "Delivery"("status", "scheduledAt");

-- CreateIndex
CREATE INDEX "DeliveryEvent_deliveryId_at_idx" ON "DeliveryEvent"("deliveryId", "at");

-- AddForeignKey
ALTER TABLE "DeliveryEvent" ADD CONSTRAINT "DeliveryEvent_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "Delivery"("id") ON DELETE CASCADE ON UPDATE CASCADE;
