-- Numérotation des commandes (HEP-52).
--
-- Le numéro est lisible et communicable au téléphone : HF-2026-0001. Il est
-- donc devinable, et ne peut pas servir à consulter une commande — c'est le
-- rôle de "publicToken". Voir la note dans src/server/services/orders.ts.
--
-- Pourquoi une table et pas une SEQUENCE : la remise à zéro annuelle. Une
-- séquence imposerait soit d'en créer une par an, soit de la réinitialiser au
-- 1er janvier — et deux commandes passées de part et d'autre de ce setval
-- porteraient le même numéro. Ici, l'année fait partie de la clé.
--
-- Contrairement à la facture, un trou dans la série des commandes est sans
-- conséquence : un panier abandonné après avoir reçu son numéro en laisse un,
-- et c'est acceptable. C'est l'unicité qui compte.
--
-- À appeler DANS la transaction qui crée la commande.

CREATE TABLE "OrderCounter" (
  "year"       INTEGER NOT NULL,
  "lastNumber" INTEGER NOT NULL DEFAULT 0,
  "updatedAt"  TIMESTAMP(3) NOT NULL,

  CONSTRAINT "OrderCounter_pkey" PRIMARY KEY ("year")
);

CREATE OR REPLACE FUNCTION next_order_number(p_year INT)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_next INT;
BEGIN
  INSERT INTO "OrderCounter" ("year", "lastNumber", "updatedAt")
  VALUES (p_year, 1, NOW())
  ON CONFLICT ("year") DO UPDATE
    SET "lastNumber" = "OrderCounter"."lastNumber" + 1,
        "updatedAt"  = NOW()
  RETURNING "lastNumber" INTO v_next;

  RETURN 'HF-' || p_year::TEXT || '-' || LPAD(v_next::TEXT, 4, '0');
END;
$$;
