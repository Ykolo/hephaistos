-- AlterTable
ALTER TABLE "CompanySettings" ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'EUR',
ADD COLUMN     "hostAddress" TEXT NOT NULL DEFAULT '440 N Barranca Ave #4133, Covina, CA 91723, États-Unis',
ADD COLUMN     "hostName" TEXT NOT NULL DEFAULT 'Vercel Inc.',
ADD COLUMN     "legalForm" TEXT,
ADD COLUMN     "publicationDirector" TEXT,
ADD COLUMN     "rcs" TEXT,
ADD COLUMN     "shareCapitalCents" INTEGER,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "siret" DROP NOT NULL,
ALTER COLUMN "vatNumber" DROP NOT NULL;


-- Les valeurs factices posées par le seed deviennent « non fournies » : un
-- SIRET « PROVISIONAL » affiché dans les mentions légales serait pire qu'un
-- « à compléter ».
UPDATE "CompanySettings" SET "siret" = NULL WHERE "siret" = 'PROVISIONAL';
UPDATE "CompanySettings" SET "vatNumber" = NULL WHERE "vatNumber" = 'PROVISIONAL';
