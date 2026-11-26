-- AlterTable
ALTER TABLE "Cart" ADD COLUMN     "shippingMethod" "ShippingMethod";

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "shippingCarrier" TEXT,
ADD COLUMN     "shippingMethod" "ShippingMethod";

-- AlterTable
ALTER TABLE "ShippingRate" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE UNIQUE INDEX "ShippingRate_method_maxWeightGrams_key" ON "ShippingRate"("method", "maxWeightGrams");

