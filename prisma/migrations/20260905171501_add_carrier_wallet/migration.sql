-- CreateTable
CREATE TABLE "CarrierWallet" (
    "carrierId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION,
    "currency" TEXT,
    "reportedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw" JSONB,

    CONSTRAINT "CarrierWallet_pkey" PRIMARY KEY ("carrierId")
);
