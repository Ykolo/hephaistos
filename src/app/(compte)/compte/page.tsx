import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AccountSignOut } from "@/components/account/account-forms";
import { AccountShell, asideLinkCls } from "@/components/account/shell";
import { formatPrice } from "@/lib/format";
import { accountRoutes, routes } from "@/lib/routes";
import { getSession } from "@/server/auth-guards";
import { db } from "@/server/db";
import { listAccountOrders } from "@/server/services/account";

export const metadata: Metadata = { title: "Mon compte" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** Libellés pour le client : ce qui compte pour lui, pas pour l'atelier. */
const STATUS: Record<string, string> = {
  PENDING: "En attente de paiement",
  PAID: "Confirmée",
  PREPARING: "En préparation",
  SHIPPED: "Expédiée",
  DELIVERED: "Livrée",
  CANCELED: "Annulée",
  REFUNDED: "Remboursée",
  PARTIALLY_REFUNDED: "Remboursée en partie",
};

const dateFmt = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "Europe/Paris",
});

/**
 * Espace client, version minimale (HEP-63) : qui est connecté, et ses
 * commandes — y compris celles passées sans compte avant l'inscription.
 * Factures, adresses et détail d'une commande viennent avec HEP-64.
 */
export default function AccountPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<AccountShell eyebrow="Votre compte" title="Mon compte">{null}</AccountShell>}>
      <AccountContent searchParams={searchParams} />
    </Suspense>
  );
}

async function AccountContent({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const session = await getSession();
  if (!session) {
    // Arrivée depuis le lien de confirmation sans session : le lien a échoué
    // (expiré ou déjà utilisé) — la connexion en renverra un.
    const failedLink = params.bienvenue !== undefined || params.error !== undefined;
    redirect(
      `${accountRoutes.signIn}?raison=${failedLink ? "lien" : "compte"}&suite=${encodeURIComponent(accountRoutes.home)}`,
    );
  }

  const orders = await listAccountOrders(db, session.user.id);

  return (
    <AccountShell
      eyebrow="Votre compte"
      title={`Bonjour${session.user.name ? `, ${session.user.name.split(" ")[0]}` : ""}`}
      intro={
        params.bienvenue !== undefined ? (
          <p className="m-0">Votre adresse est confirmée. Bienvenue chez Héphaïstos.</p>
        ) : (
          <p className="m-0 text-muted-ink">{session.user.email}</p>
        )
      }
      aside={<AccountSignOut />}
    >
      <h2 className="m-0 mb-5 text-[11px] font-normal uppercase tracking-[.16em] text-muted-ink">
        Vos commandes
      </h2>
      {orders.length === 0 ? (
        <p className="m-0 text-[14px] leading-[1.7] text-body">
          Aucune commande pour l&apos;instant.{" "}
          <Link href={routes.shop} className={asideLinkCls}>
            Découvrir le rituel
          </Link>
        </p>
      ) : (
        <ul className="m-0 list-none border-t border-line p-0">
          {orders.map((order) => (
            <li
              key={order.number}
              className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-line py-4 text-[14px]"
            >
              <span className="font-serif text-[1.1rem]">{order.number}</span>
              <span className="text-muted-ink">{dateFmt.format(order.createdAt)}</span>
              <span>{STATUS[order.status] ?? order.status}</span>
              <span className="tabular-nums">{formatPrice(order.totalCents)}</span>
            </li>
          ))}
        </ul>
      )}
    </AccountShell>
  );
}
