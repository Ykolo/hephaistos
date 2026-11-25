-- L'ancien seed posait « À compléter » comme numéro et rue du siège. Rendu
-- tel quel, il passerait pour une adresse ; vide, le site affiche la mention
-- « à compléter » à sa place (HEP-80).
UPDATE "CompanySettings"
SET "address" = jsonb_set("address"::jsonb, '{line1}', '""'::jsonb)
WHERE "address"->>'line1' = 'À compléter';
