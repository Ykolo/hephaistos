/**
 * Contenu éditorial encore en dur.
 *
 * Séparé du catalogue en HEP-45 : ce ne sont pas des données produit, elles
 * n'ont donc rien à faire dans `products.ts`, désormais réduit aux types.
 *
 * Ce fichier est une étape, pas une destination : les textes légaux passent en
 * base avec HEP-81 (`ContentBlock`), et les visuels éditoriaux quittent le CDN
 * Shopify avec HEP-43 (Vercel Blob).
 */

const CDN = "https://hephaistosparis.com/cdn/shop/files";

/** Visuels éditoriaux réutilisés d'une page à l'autre. */
export const heroImages = {
  home: `${CDN}/hf_20260608_132538_2c01770c-1230-4bca-8da0-93cf2cb6091f.png?v=1780925206&width=1600`,
  featured: `${CDN}/hf_20260618_125354_856d9c75-68cf-4560-9867-c25c0e38c6d5.png?v=1781788175&width=1400`,
  editorial: `${CDN}/hf_20260608_134149_2c6f91de-75c3-4928-8c6c-07263e85c9de.jpg?v=1780926192&width=1400`,
  histoire: `${CDN}/hf_20260608_134149_2c6f91de-75c3-4928-8c6c-07263e85c9de.jpg?v=1780926192&width=1600`,
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
