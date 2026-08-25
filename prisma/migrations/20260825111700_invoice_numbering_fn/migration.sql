-- Numérotation de factures continue et sans trou (obligation française).
--
-- Volontairement PAS une SEQUENCE Postgres : nextval() est non transactionnel,
-- donc un rollback consomme le numéro et laisse un trou dans la série.
-- Ici le compteur vit dans une table ordinaire : l'UPDATE est verrouillé par
-- Postgres jusqu'à la fin de la transaction appelante, et un rollback rend le
-- numéro. Deux commandes simultanées sont sérialisées sur cette ligne — sans
-- conséquence au volume visé, et c'est le prix de la conformité.
--
-- À appeler DANS la transaction qui crée la facture, jamais avant.

CREATE OR REPLACE FUNCTION next_invoice_number(p_year INT)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_next INT;
BEGIN
  INSERT INTO "InvoiceCounter" ("year", "lastNumber", "updatedAt")
  VALUES (p_year, 1, NOW())
  ON CONFLICT ("year") DO UPDATE
    SET "lastNumber" = "InvoiceCounter"."lastNumber" + 1,
        "updatedAt"  = NOW()
  RETURNING "lastNumber" INTO v_next;

  RETURN 'FA-' || p_year::TEXT || '-' || LPAD(v_next::TEXT, 6, '0');
END;
$$;

-- Décrément atomique du stock — invariant §4.1 de docs/BACKEND.md.
--
-- Interdit : SELECT stock puis UPDATE stock = stock - qty. Entre les deux, une
-- autre commande passe et le dernier flacon part deux fois. Ici la condition
-- `stock >= qty` est évaluée par Postgres sous le verrou de ligne de l'UPDATE.
-- Retourne le stock restant, ou NULL si la rupture empêche la vente : à
-- l'appelant d'annuler toute la transaction.

CREATE OR REPLACE FUNCTION decrement_stock(p_product_id TEXT, p_qty INT)
RETURNS INT
LANGUAGE plpgsql
AS $$
DECLARE
  v_remaining INT;
BEGIN
  IF p_qty <= 0 THEN
    RAISE EXCEPTION 'decrement_stock: quantité invalide (%)', p_qty;
  END IF;

  UPDATE "Product"
     SET "stock" = "stock" - p_qty
   WHERE "id" = p_product_id
     AND "stock" >= p_qty
  RETURNING "stock" INTO v_remaining;

  RETURN v_remaining; -- NULL = rupture ou produit inconnu
END;
$$;
