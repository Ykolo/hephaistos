/**
 * Informations de la société (HEP-80) — la partie pure, partagée par les
 * mentions légales, les CGV, le pied de page, l'admin et, demain, les
 * factures (HEP-61).
 *
 * Une valeur absente n'est **jamais** remplacée par une valeur plausible :
 * elle s'affiche « à compléter ». Des mentions légales inventées sont pires
 * que des mentions incomplètes — les deux exposent à l'amende de l'article
 * L111-1 du code de la consommation, mais seules les premières trompent.
 */

export type CompanyAddress = {
  line1: string;
  line2?: string | null;
  postalCode: string;
  city: string;
  country: string;
};

export type CompanyInfo = {
  legalName: string;
  legalForm: string | null;
  shareCapitalCents: number | null;
  address: CompanyAddress;
  siret: string | null;
  vatNumber: string | null;
  rcs: string | null;
  publicationDirector: string | null;
  contactEmail: string;
  contactPhone: string | null;
  vatRate: number;
  shipsTo: string[];
  currency: string;
  hostName: string;
  hostAddress: string;
};

export const TO_COMPLETE = "à compléter";

const COUNTRY_NAMES: Record<string, string> = {
  FR: "France",
  BE: "Belgique",
  LU: "Luxembourg",
  CH: "Suisse",
  MC: "Monaco",
  DE: "Allemagne",
  ES: "Espagne",
  IT: "Italie",
};

export function countryName(code: string): string {
  return COUNTRY_NAMES[code] ?? code;
}

/** Adresse sur une ligne. `null` si la rue manque : une ville seule n'est pas un siège. */
export function formatAddress(address: CompanyAddress): string | null {
  if (!address.line1.trim() || !address.postalCode.trim() || !address.city.trim()) return null;
  return [address.line1, address.line2, `${address.postalCode} ${address.city}`, countryName(address.country)]
    .filter((part) => part && part.trim())
    .join(", ");
}

/** « 1 000 € », sans centimes quand il n'y en a pas — c'est ainsi qu'un capital s'écrit. */
export function formatCapital(cents: number): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}

/** « 123 456 789 00012 » : SIREN puis NIC, comme sur un Kbis. */
export function formatSiret(siret: string): string {
  return `${siret.slice(0, 3)} ${siret.slice(3, 6)} ${siret.slice(6, 9)} ${siret.slice(9)}`;
}

// --- Contrôles ---------------------------------------------------------------

/** Chiffres seuls : on accepte la saisie avec espaces, on stocke sans. */
export function digitsOnly(raw: string): string {
  return raw.replace(/[\s.-]/g, "");
}

/**
 * SIRET : 14 chiffres dont la clé de Luhn est juste.
 *
 * Exception documentée par l'INSEE : les établissements de La Poste (SIREN
 * 356 000 000) ne respectent pas Luhn ; leur somme de chiffres est un
 * multiple de 5.
 */
export function isValidSiret(siret: string): boolean {
  if (!/^\d{14}$/.test(siret)) return false;
  if (siret.startsWith("356000000")) {
    return [...siret].reduce((n, d) => n + Number(d), 0) % 5 === 0;
  }
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    let d = Number(siret[13 - i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

/** Clé de TVA française d'un SIREN : (12 + 3 × (SIREN mod 97)) mod 97. */
export function frenchVatKey(siren: string): string {
  return String((12 + 3 * (Number(siren) % 97)) % 97).padStart(2, "0");
}

/** « FR » + clé + SIREN, avec une clé juste. */
export function isValidFrenchVat(vat: string): boolean {
  const m = /^FR(\d{2})(\d{9})$/.exec(vat);
  return m !== null && m[1] === frenchVatKey(m[2]);
}

// --- Mentions ------------------------------------------------------------------

export type LegalRow = { label: string; value: string; missing: boolean };

function row(label: string, value: string | null | undefined): LegalRow {
  return value && value.trim()
    ? { label, value, missing: false }
    : { label, value: TO_COMPLETE, missing: true };
}

/**
 * Mentions légales obligatoires d'un site marchand (LCEN art. 6, code de
 * commerce R123-237), dans l'ordre où on les cherche.
 */
export function legalMentions(info: CompanyInfo): LegalRow[] {
  const identity = info.legalForm ? `${info.legalName}, ${info.legalForm}` : info.legalName;
  return [
    row("Éditeur", identity),
    row("Capital social", info.shareCapitalCents != null ? formatCapital(info.shareCapitalCents) : null),
    row("Siège social", formatAddress(info.address)),
    row("SIRET", info.siret ? formatSiret(info.siret) : null),
    row("RCS", info.rcs),
    row("TVA intracommunautaire", info.vatNumber),
    row("Directeur de la publication", info.publicationDirector),
    row("Contact", [info.contactEmail, info.contactPhone].filter(Boolean).join(" · ")),
    row("Hébergeur", `${info.hostName}, ${info.hostAddress}`),
  ];
}

/** Ce qui manque encore, pour l'alerte de l'admin. */
export function missingLegalFields(info: CompanyInfo): string[] {
  return legalMentions(info)
    .filter((r) => r.missing)
    .map((r) => r.label);
}

/** « Livraison en France » / « en France, en Belgique et au Luxembourg ». */
export function shipsToLabel(codes: readonly string[]): string {
  const names = codes.map(countryName);
  if (names.length <= 1) return names[0] ?? countryName("FR");
  return `${names.slice(0, -1).join(", ")} et ${names.at(-1)}`;
}

/** Ligne du pied de page : la société et sa ville, sans rien d'inventé. */
export function footerLine(info: CompanyInfo): string {
  const city = info.address.city.trim();
  return city ? `${info.legalName} · ${city}, ${countryName(info.address.country)}` : info.legalName;
}

/**
 * Résumé des CGV en attendant le texte intégral de Jules (HEP-81) : tout ce
 * qui dépend de la société — vendeur, TVA, pays livrés — vient des réglages.
 */
export function cgvSummary(info: CompanyInfo): string {
  const seat = formatAddress(info.address);
  const seller = seat ? `${info.legalName}, dont le siège est situé ${seat}` : info.legalName;
  const rate = String(info.vatRate / 100).replace(".", ",");
  return (
    `Les présentes CGV régissent les ventes conclues sur le site Héphaïstos, édité par ${seller}. ` +
    `Prix exprimés en euros toutes taxes comprises (TVA ${rate} % incluse). ` +
    `Paiement sécurisé par carte bancaire, traité par Stripe. ` +
    `Livraison en ${shipsToLabel(info.shipsTo)}, en point relais ou à domicile. ` +
    `Droit de rétractation de 14 jours conformément au code de la consommation. ` +
    `Le texte intégral rédigé par Jules sera intégré ici.`
  );
}
