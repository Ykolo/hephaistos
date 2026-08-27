/**
 * Contenu éditorial encore en dur.
 *
 * Séparé du catalogue en HEP-45 : ce ne sont pas des données produit, elles
 * n'ont donc rien à faire dans `products.ts`, désormais réduit aux types.
 *
 * Ce fichier est une étape, pas une destination : les textes légaux passent en
 * base avec HEP-81 (`ContentBlock`). Les visuels éditoriaux ont quitté le CDN
 * Shopify pour Vercel Blob (HEP-43) — voir `scripts/migrate-hero-images.ts`.
 */

/** Visuels éditoriaux réutilisés d'une page à l'autre. */
export const heroImages = {
  home: "https://j0rkrhdbaya8wld3.public.blob.vercel-storage.com/produits/editorial-home/8dffff70-2e79-4a3d-bedb-1f3115c940d4-1024.webp",
  featured: "https://j0rkrhdbaya8wld3.public.blob.vercel-storage.com/produits/editorial-featured/df02fb23-c54a-4c2f-94dd-a1ba2df66fdf-1024.webp",
  editorial: "https://j0rkrhdbaya8wld3.public.blob.vercel-storage.com/produits/editorial-editorial/a7fa564f-fbfb-4c88-a763-0c170ec66f97-1024.webp",
  histoire: "https://j0rkrhdbaya8wld3.public.blob.vercel-storage.com/produits/editorial-histoire/1a0df5af-6f62-4cf7-81b1-17f7725c87b1-1024.webp",
};

export type LegalKey = "mentions" | "cgv" | "confid" | "cookies" | "retour";

/**
 * ⚠️ Ces textes sont faux sur deux points signalés dans `docs/BACKEND.md` §6 :
 * ils annoncent un hébergement et un paiement Shopify, décision inversée
 * depuis. SIRET, capital et TVA restent à fournir par Jules. À corriger avant
 * toute mise en ligne — c'est bloquant (HEP-87).
 */
export const legalContent: Record<LegalKey, { t: string; b: string }> = {
  mentions: {
    t: "Mentions légales",
    b: "Éditeur du site : Héphaïstos Paris. Siège social : Paris, France. Directeur de la publication : Jules [Nom]. Hébergement : Shopify Inc. Contact : contact@hephaistosparis.com. SIRET, capital social et numéro de TVA intracommunautaire à compléter.",
  },
  cgv: {
    t: "Conditions générales de vente",
    b: "Les présentes CGV régissent les ventes conclues sur le site Héphaïstos. Prix exprimés en euros toutes taxes comprises. Paiement sécurisé via Shopify Payments. Livraison en France et en Europe. Droit de rétractation de 14 jours conformément au Code de la consommation. Le texte intégral rédigé par Jules sera intégré ici.",
  },
  confid: {
    t: "Politique de confidentialité",
    b: "Les données collectées (email, informations de commande) sont traitées conformément au RGPD, uniquement pour le traitement des commandes et, avec consentement, l'envoi de la newsletter. Vous disposez d'un droit d'accès, de rectification et de suppression. Aucune donnée n'est revendue à des tiers.",
  },
  cookies: {
    t: "Gestion des cookies",
    b: "Le site utilise des cookies nécessaires à son fonctionnement et, sous réserve de votre consentement, des cookies de mesure d'audience et marketing. Vous pouvez gérer vos préférences à tout moment depuis le bandeau dédié.",
  },
  retour: {
    t: "Retours & remboursements",
    b: "Vous disposez de 14 jours après réception pour retourner un produit non ouvert. Les frais de retour sont à la charge du client sauf produit défectueux. Le remboursement est effectué sous 14 jours après réception du retour, via le moyen de paiement initial.",
  },
};

export const legalTabs: { key: LegalKey; label: string }[] = [
  { key: "mentions", label: "Mentions légales" },
  { key: "cgv", label: "CGV" },
  { key: "confid", label: "Confidentialité" },
  { key: "cookies", label: "Cookies" },
  { key: "retour", label: "Retours & remboursements" },
];
