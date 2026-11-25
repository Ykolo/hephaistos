-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "consentAt" TIMESTAMP(3),
ADD COLUMN     "consentRecordId" TEXT;

-- CreateTable
CREATE TABLE "ConsentRecord" (
    "id" TEXT NOT NULL,
    "consentId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "analytics" BOOLEAN NOT NULL,
    "marketing" BOOLEAN NOT NULL,
    "action" TEXT NOT NULL,
    "ipHash" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsentRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ConsentRecord_consentId_createdAt_idx" ON "ConsentRecord"("consentId", "createdAt");

