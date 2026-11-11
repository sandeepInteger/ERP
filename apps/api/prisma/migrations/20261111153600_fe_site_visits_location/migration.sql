-- AlterTable
ALTER TABLE "ericsson_sites" ADD COLUMN     "latitude" DOUBLE PRECISION,
ADD COLUMN     "longitude" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "locationConsentAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ericsson_site_visits" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "checkInAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "checkInLat" DOUBLE PRECISION NOT NULL,
    "checkInLng" DOUBLE PRECISION NOT NULL,
    "checkInAccuracy" DOUBLE PRECISION,
    "checkInDistanceM" DOUBLE PRECISION,
    "checkOutAt" TIMESTAMP(3),
    "checkOutLat" DOUBLE PRECISION,
    "checkOutLng" DOUBLE PRECISION,
    "checkOutAccuracy" DOUBLE PRECISION,
    "checkOutBy" TEXT,
    "source" TEXT NOT NULL DEFAULT 'browser',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ericsson_site_visits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ericsson_location_points" (
    "id" TEXT NOT NULL,
    "visitId" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "accuracy" DOUBLE PRECISION,
    "recordedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ericsson_location_points_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ericsson_site_visits_userId_checkOutAt_idx" ON "ericsson_site_visits"("userId", "checkOutAt");

-- CreateIndex
CREATE INDEX "ericsson_site_visits_siteId_checkInAt_idx" ON "ericsson_site_visits"("siteId", "checkInAt");

-- CreateIndex
CREATE INDEX "ericsson_location_points_visitId_recordedAt_idx" ON "ericsson_location_points"("visitId", "recordedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ericsson_location_points_visitId_recordedAt_key" ON "ericsson_location_points"("visitId", "recordedAt");

-- AddForeignKey
ALTER TABLE "ericsson_site_visits" ADD CONSTRAINT "ericsson_site_visits_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "ericsson_sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ericsson_site_visits" ADD CONSTRAINT "ericsson_site_visits_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ericsson_location_points" ADD CONSTRAINT "ericsson_location_points_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "ericsson_site_visits"("id") ON DELETE CASCADE ON UPDATE CASCADE;
