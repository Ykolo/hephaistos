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
 * Textes des onglets de `/legal`. Les mentions légales et les CGV sont
 * construites depuis les réglages entreprise (HEP-80) ; les autres restent ici
 * jusqu'à HEP-81.
 */
export const legalContent: Record<LegalKey, { t: string; b: string }> = {
  // Mentions légales et CGV : construites depuis les réglages entreprise
  // (HEP-80, `src/lib/company.ts`), jamais écrites en dur ici. Ces deux
  // textes annonçaient Shopify comme hébergeur et moyen de paiement.
  mentions: { t: "Mentions légales", b: "" },
  cgv: { t: "Conditions générales de vente", b: "" },
  confid: {
    t: "Politique de confidentialité",
    b: "Les données collectées (email, informations de commande) sont traitées conformément au RGPD, uniquement pour le traitement des commandes et, avec consentement, l'envoi de la newsletter. Vous disposez d'un droit d'accès, de rectification et de suppression. Aucune donnée n'est revendue à des tiers.",
  },
  cookies: {
    t: "Gestion des cookies",
    b: "Le site utilise des cookies nécessaires à son fonctionnement — ils ne demandent pas votre accord — et, seulement si vous l'acceptez, des cookies de mesure d'audience et de marketing. Aucun de ces derniers n'est déposé avant votre choix ; fermer la bannière vaut refus. Votre choix est conservé 6 mois, puis redemandé. Nous gardons une preuve de chaque choix (date, catégories, version de la bannière) sans conserver votre adresse IP en clair. Vous pouvez changer d'avis à tout moment.",
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
