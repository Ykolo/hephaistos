import type { OrderStatus, Prisma } from "@/generated/prisma/client";
import type { Tx } from "../db";
import {
  ADMIN_SETTABLE_STATUSES,
  QUICK_FILTERS,
  type OrderSearch,
  type QuickFilter,
} from "@/lib/validation/admin-order";
import { ORDER_TRANSITIONS } from "./orders";

/**
 * Lecture des commandes pour l'administration (HEP-56).
 *
 * L'écran que Jules ouvre tous les matins. Deux exigences le gouvernent :
 *
 *   - **retrouver une commande à partir d'un appel client** — un numéro dicté,
 *     un nom, un bout d'email ;
 *   - **sortir la pile de travail du jour** sans rien oublier ni rien de trop.
 *
 * Les écritures (changer d'état, annuler, noter) ne sont pas ici : elles
 * passent par `orders.ts`, qui porte la table de transitions et le journal.
 * Ce fichier ne fait que lire.
 */

export const ORDER_PAGE_SIZE = 25;

/** Fuseau de la boutique : « aujourd'hui » se compte à Paris, pas en UTC. */
const SHOP_TIME_ZONE = "Europe/Paris";

// --- Dates à l'heure de Paris -------------------------------------------------

const offsetFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: SHOP_TIME_ZONE,
  timeZoneName: "longOffset",
});

/** Décalage de Paris par rapport à UTC à cet instant, en minutes (+60 ou +120). */
function parisOffsetMinutes(at: Date): number {
  const name = offsetFormat.formatToParts(at).find((p) => p.type === "timeZoneName")?.value;
  // « GMT+02:00 » — ou « GMT » tout court quand le décalage est nul.
  const match = name?.match(/GMT([+-])(\d{2}):(\d{2})/);
  if (!match) return 0;
  const minutes = Number(match[2]) * 60 + Number(match[3]);
  return match[1] === "-" ? -minutes : minutes;
}

/**
 * Minuit à Paris pour un jour `AAAA-MM-JJ`, en instant UTC.
 *
 * Sans cette conversion, une commande passée le 3 à 0 h 30 (heure de Paris)
 * serait rangée dans la journée du 2 — et le filtre « du jour » raterait
 * chaque nuit les commandes de la première heure, deux en été.
 *
 * Le décalage est lu à minuit UTC du même jour : à cet instant Paris est entre
 * 1 h et 2 h du matin, avant le changement d'heure (toujours à 2 h ou 3 h). Le
 * décalage lu est donc bien celui de minuit, y compris les jours de bascule.
 */
export function parisMidnight(day: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  const utcMidnight = Date.UTC(y, m - 1, d);
  return new Date(utcMidnight - parisOffsetMinutes(new Date(utcMidnight)) * 60_000);
}

const dayFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: SHOP_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Le jour calendaire à Paris, `AAAA-MM-JJ`. */
export function parisDay(at: Date): string {
  return dayFormat.format(at);
}

/** Le jour qui suit, `AAAA-MM-JJ` — calcul calendaire, sans fuseau. */
function nextDay(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

// --- Filtres ------------------------------------------------------------------

/** États d'une commande payée qui n'est pas encore partie. */
const AWAITING_SHIPMENT: OrderStatus[] = ["PAID", "PREPARING"];

/**
 * Raccourcis de la barre de filtres.
 *
 * « À expédier » est **la pile de travail du jour**, et c'est sa definition of
 * done : payées, pas encore parties, et — pour une précommande — dont la date
 * d'envoi annoncée est atteinte. Une précommande pour le 15 novembre n'a rien
 * à faire dans la pile du 2 octobre : elle y serait expédiée à tort, avant que
 * la marchandise n'existe.
 *
 * Une précommande **sans** date reste dans la pile : c'est une anomalie
 * (la date est obligatoire), et une anomalie doit se voir, pas disparaître.
 */
function quickFilterWhere(quick: QuickFilter, now: Date): Prisma.OrderWhereInput {
  const today = parisDay(now);
  switch (quick) {
    case "a-expedier":
      return {
        status: { in: AWAITING_SHIPMENT },
        OR: [
          { isPreorder: false },
          { preorderShipsAt: null },
          { preorderShipsAt: { lt: parisMidnight(nextDay(today)) } },
        ],
      };
    case "attente-paiement":
      return { status: "PENDING" };
    case "precommandes":
      // Les précommandes encaissées qui attendent leur marchandise. Une
      // précommande jamais payée n'engage rien : elle est sous « en attente ».
      return { isPreorder: true, status: { in: AWAITING_SHIPMENT } };
    case "du-jour":
      return { createdAt: { gte: parisMidnight(today) } };
  }
}

/**
 * Champs interrogés par la recherche libre.
 *
 * Volontairement **sur `Order` seulement**, sans jointure sur les lignes : à
 * quelques centaines de commandes, un `ILIKE` balaie la table en quelques
 * millisecondes. La recherche plein texte (`tsvector`) ne vaudra son coût
 * qu'au-delà de plusieurs milliers de commandes — cf. l'issue.
 *
 * Le nom vit dans l'adresse figée (JSON) : c'est le nom **sur le colis**,
 * celui que le client donne au téléphone.
 */
function termWhere(term: string): Prisma.OrderWhereInput {
  const insensitive = { string_contains: term, mode: "insensitive" } as const;
  return {
    OR: [
      { number: { contains: term, mode: "insensitive" } },
      { email: { contains: term, mode: "insensitive" } },
      { shippingAddress: { path: ["lastName"], ...insensitive } },
      { shippingAddress: { path: ["firstName"], ...insensitive } },
      { billingAddress: { path: ["lastName"], ...insensitive } },
    ],
  };
}

/**
 * Construit le filtre Prisma d'une recherche.
 *
 * Chaque mot doit être trouvé quelque part : « jules forgeron » trouve Jules
 * Forgeron (prénom + nom) sans trouver tous les Jules de la base.
 */
export function orderSearchWhere(
  search: OrderSearch,
  now: Date = new Date(),
): Prisma.OrderWhereInput {
  const and: Prisma.OrderWhereInput[] = [];

  const terms = (search.q ?? "").split(/\s+/).filter(Boolean);
  for (const term of terms) and.push(termWhere(term));

  if (search.status) and.push({ status: search.status });
  if (search.quick) and.push(quickFilterWhere(search.quick, now));

  if (search.from || search.to) {
    and.push({
      createdAt: {
        ...(search.from ? { gte: parisMidnight(search.from) } : {}),
        // Borne exclusive au lendemain minuit : « jusqu'au 3 » inclut tout le 3.
        ...(search.to ? { lt: parisMidnight(nextDay(search.to)) } : {}),
      },
    });
  }

  return and.length > 0 ? { AND: and } : {};
}

/**
 * Ordre par défaut : les plus récentes d'abord — sauf pour la pile « à
 * expédier », qui se traite dans l'ordre d'arrivée. Le client qui a commandé
 * lundi passe avant celui de mardi.
 */
function sortOf(search: OrderSearch): Prisma.SortOrder {
  return search.sort ?? (search.quick === "a-expedier" ? "asc" : "desc");
}

// --- Liste --------------------------------------------------------------------

/** Nom porté sur l'adresse figée, lu prudemment : c'est du JSON. */
function customerName(address: Prisma.JsonValue): string | null {
  if (!address || typeof address !== "object" || Array.isArray(address)) return null;
  const { firstName, lastName } = address as Record<string, unknown>;
  const name = [firstName, lastName].filter((p) => typeof p === "string" && p).join(" ");
  return name || null;
}

export type AdminOrderRow = {
  id: string;
  number: string;
  email: string;
  customerName: string | null;
  status: OrderStatus;
  totalCents: number;
  createdAt: Date;
  isPreorder: boolean;
  preorderShipsAt: Date | null;
};

export type AdminOrderPage = {
  rows: AdminOrderRow[];
  total: number;
  page: number;
  pageCount: number;
  sort: Prisma.SortOrder;
};

export async function searchOrders(
  tx: Tx,
  search: OrderSearch,
  now: Date = new Date(),
): Promise<AdminOrderPage> {
  const where = orderSearchWhere(search, now);
  const sort = sortOf(search);

  const total = await tx.order.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / ORDER_PAGE_SIZE));
  // Une page au-delà de la dernière — lien périmé après un filtre — ramène à
  // la dernière plutôt qu'à un tableau vide qui laisserait croire à une base vide.
  const page = Math.min(search.page ?? 1, pageCount);

  const orders = await tx.order.findMany({
    where,
    // Départage par numéro : deux commandes dans la même milliseconde ne
    // doivent pas changer de page d'un rechargement à l'autre.
    orderBy: [{ createdAt: sort }, { number: sort }],
    skip: (page - 1) * ORDER_PAGE_SIZE,
    take: ORDER_PAGE_SIZE,
    select: {
      id: true,
      number: true,
      email: true,
      status: true,
      totalCents: true,
      createdAt: true,
      isPreorder: true,
      preorderShipsAt: true,
      shippingAddress: true,
    },
  });

  return {
    rows: orders.map(({ shippingAddress, ...o }) => ({
      ...o,
      customerName: customerName(shippingAddress),
    })),
    total,
    page,
    pageCount,
    sort,
  };
}

/**
 * Compteurs des raccourcis, pour voir d'un coup d'œil s'il y a du travail.
 *
 * Quatre `COUNT` sur des colonnes indexées : négligeable au volume visé.
 */
export async function countQuickFilters(
  tx: Tx,
  now: Date = new Date(),
): Promise<Record<QuickFilter, number>> {
  const counts = await Promise.all(
    QUICK_FILTERS.map((quick) => tx.order.count({ where: quickFilterWhere(quick, now) })),
  );
  return Object.fromEntries(QUICK_FILTERS.map((q, i) => [q, counts[i]])) as Record<
    QuickFilter,
    number
  >;
}

// --- Fiche détail -------------------------------------------------------------

/**
 * Tout ce qu'il faut pour traiter un appel client **sans ouvrir Stripe** —
 * c'est la definition of done de la fiche.
 *
 * Recherche par **numéro** : en administration, c'est l'identifiant qui se
 * dicte. Le suivi public, lui, n'accepte que `publicToken` (cf. `orders.ts`).
 */
export async function getAdminOrder(tx: Tx, number: string) {
  if (!number) return null;

  return tx.order.findUnique({
    where: { number },
    include: {
      items: { orderBy: { nameSnapshot: "asc" } },
      // Même ordre que `listOrderEvents` : date puis identifiant.
      events: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
      shipments: { orderBy: { shippedAt: "asc" } },
      invoice: { select: { number: true, issuedAt: true } },
    },
  });
}

export type AdminOrder = NonNullable<Awaited<ReturnType<typeof getAdminOrder>>>;

/**
 * États proposés dans le menu « changer d'état » pour une commande donnée.
 *
 * L'intersection de la table de transitions et de ce qui se pose à la main :
 * le menu ne propose jamais une transition que le service refuserait.
 */
export function adminNextStatuses(status: OrderStatus): AdminSettableStatus[] {
  return ADMIN_SETTABLE_STATUSES.filter((s) => ORDER_TRANSITIONS[status].includes(s));
}

export type AdminSettableStatus = (typeof ADMIN_SETTABLE_STATUSES)[number];

/**
 * Lien vers le paiement dans le tableau de bord Stripe.
 *
 * Le mode se déduit de la clé secrète : une clé `sk_live_` ouvre le tableau
 * de bord réel, tout le reste — clé de test ou absente — le mode test. Se
 * tromper ici enverrait Jules chercher un paiement réel dans le bac à sable.
 */
export function stripePaymentUrl(
  paymentIntentId: string,
  secretKey: string | undefined = process.env.STRIPE_SECRET_KEY,
): string {
  const live = secretKey?.startsWith("sk_live_") ?? false;
  return `https://dashboard.stripe.com/${live ? "" : "test/"}payments/${encodeURIComponent(paymentIntentId)}`;
}
