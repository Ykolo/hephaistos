-- Liste des commandes en administration (HEP-56) : tri par date sans filtre.
-- Les index ("email", "createdAt") et ("status", "createdAt") ne servent que
-- si la première colonne est fixée.
-- CreateIndex
CREATE INDEX "Order_createdAt_idx" ON "Order"("createdAt");
