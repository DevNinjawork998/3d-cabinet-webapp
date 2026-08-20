-- Adds SiteImage: one marketing photo per homepage slot.
--
-- Additive only — creates a new table, touches nothing existing. `key` is the
-- slot the photo fills (`hero`, `room:kitchen`, `finish:<finishId>`) and is
-- the primary key, so re-uploading a slot is an upsert rather than a second
-- row. Bytes live in Vercel Blob; only the URL is stored here, same rule as
-- CatalogueImport.

CREATE TABLE "SiteImage" (
    "key" TEXT NOT NULL,
    "blobUrl" TEXT NOT NULL,
    "blobPathname" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "uploadedBy" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiteImage_pkey" PRIMARY KEY ("key")
);
