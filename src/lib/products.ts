export type ProductCategory = "Nettoyage" | "Soin ciblé" | "Hydratation";

export interface Product {
  id: string;
  name: string;
  cat: ProductCategory;
  price: string;
  tagline: string;
  img: string;
  imgHover: string;
  gallery: string[];
  desc: string;
  benefits: string[];
  usage: string;
  inci: string;
}

const CDN = "https://hephaistosparis.com/cdn/shop/files";

export const products: Product[] = [
  {
    id: "nettoyant",
    name: "Nettoyant Visage",
    cat: "Nettoyage",
    price: "15",
    tagline: "Purifie sans agresser",
    img: `${CDN}/image_5.webp?v=1782162488&width=1024`,
    imgHover: `${CDN}/hf_20260618_130056_b8de04a8-0778-418a-bc29-44644f6f5cb9.jpg?v=1781788244&width=1024`,
    gallery: [
      `${CDN}/image_5.webp?v=1782162488&width=1200`,
      `${CDN}/hf_20260618_130056_b8de04a8-0778-418a-bc29-44644f6f5cb9.jpg?v=1781788244&width=1200`,
    ],
    desc: "Le premier geste du rituel. Une mousse nettoyante qui élimine impuretés, excès de sébum et pollution sans agresser la barrière cutanée. La peau est nette, fraîche, prête à recevoir le soin.",
    benefits: [
      "Élimine impuretés et excès de sébum",
      "Respecte la barrière cutanée",
      "Fini frais et net, sans tiraillement",
      "Adapté à un usage quotidien matin et soir",
    ],
    usage:
      "Matin et soir, faire mousser une petite quantité entre les mains humides, masser le visage en évitant le contour des yeux, puis rincer à l'eau claire.",
    inci: "Aqua, Sodium Cocoyl Glycinate, Glycerin, Coco-Betaine… (liste INCI complète à intégrer depuis la fiche fournisseur).",
  },
  {
    id: "serum",
    name: "Sérum Régulateur de Sébum",
    cat: "Soin ciblé",
    price: "20",
    tagline: "Équilibre — matifie sans assécher",
    img: `${CDN}/image_1.webp?v=1782161694&width=1024`,
    imgHover: `${CDN}/hf_20260618_125354_856d9c75-68cf-4560-9867-c25c0e38c6d5.png?v=1781788175&width=1024`,
    gallery: [
      `${CDN}/image_1.webp?v=1782161694&width=1200`,
      `${CDN}/hf_20260618_125354_856d9c75-68cf-4560-9867-c25c0e38c6d5.png?v=1781788175&width=1200`,
    ],
    desc: "Le cœur du rituel. Un sérum léger qui régule la production de sébum et resserre l'aspect des pores. La peau est matifiée, équilibrée, sans effet desséchant.",
    benefits: [
      "Régule l'excès de sébum",
      "Matifie la zone T",
      "Affine l'aspect des pores",
      "Texture légère, pénétration rapide",
    ],
    usage:
      "Matin et/ou soir sur peau propre et sèche, appliquer quelques gouttes sur le visage et masser jusqu'à absorption, avant la crème hydratante.",
    inci: "Aqua, Niacinamide, Zinc PCA, Glycerin… (liste INCI complète à intégrer depuis la fiche fournisseur).",
  },
  {
    id: "creme",
    name: "Crème Hydratante Légère",
    cat: "Hydratation",
    price: "20",
    tagline: "Hydrate, jamais gras",
    img: `${CDN}/image_4.webp?v=1782162138&width=1024`,
    imgHover: `${CDN}/hf_20260618_125819_66b9e5b2-01ad-41e0-9ac5-0158de0617ad.png?v=1781788133&width=1024`,
    gallery: [
      `${CDN}/image_4.webp?v=1782162138&width=1200`,
      `${CDN}/hf_20260618_125819_66b9e5b2-01ad-41e0-9ac5-0158de0617ad.png?v=1781788133&width=1200`,
    ],
    desc: "Le geste final. Une crème légère qui hydrate durablement sans laisser de film gras. La peau est souple, confortable, protégée tout au long de la journée.",
    benefits: [
      "Hydratation longue durée",
      "Fini non gras, absorption rapide",
      "Apaise et assouplit la peau",
      "Base idéale avant le rasage ou la journée",
    ],
    usage:
      "Matin et soir, appliquer une noisette sur l'ensemble du visage après le sérum, masser délicatement jusqu'à pénétration complète.",
    inci: "Aqua, Glycerin, Caprylic/Capric Triglyceride, Squalane… (liste INCI complète à intégrer depuis la fiche fournisseur).",
  },
];

export function getProduct(id: string): Product | undefined {
  return products.find((p) => p.id === id);
}

/** Editorial imagery reused across pages */
export const heroImages = {
  home: `${CDN}/hf_20260608_132538_2c01770c-1230-4bca-8da0-93cf2cb6091f.png?v=1780925206&width=1600`,
  featured: `${CDN}/hf_20260618_125354_856d9c75-68cf-4560-9867-c25c0e38c6d5.png?v=1781788175&width=1400`,
  editorial: `${CDN}/hf_20260608_134149_2c6f91de-75c3-4928-8c6c-07263e85c9de.jpg?v=1780926192&width=1400`,
  histoire: `${CDN}/hf_20260608_134149_2c6f91de-75c3-4928-8c6c-07263e85c9de.jpg?v=1780926192&width=1600`,
};

export type LegalKey = "mentions" | "cgv" | "confid" | "cookies" | "retour";

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
