import { Suspense } from "react";
import Link from "next/link";
import { SignOutButton } from "@/components/admin/sign-out-button";
import { adminRoutes } from "@/lib/routes";
import { requireAdminPage } from "@/server/admin-guard";
import { db } from "@/server/db";
import { countNewMessages } from "@/server/services/messages";

/**
 * Back-office (HEP-78) : tout ce qui est sous ce groupe exige un admin
 * connecté, avec TOTP, dans une session de moins de 8 h et active.
 *
 * Le proxy a déjà vérifié la requête ; ce layout revérifie, au cas où une
 * route échapperait un jour au matcher. La vérification lit la session,
 * donc les en-têtes : elle se fait dans une limite `Suspense` pour que
 * `cacheComponents` ne tente pas de prérendre le back-office.
 */
export default function BackOfficeLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-[1100px] px-5 py-10 sm:px-10">
      <Suspense fallback={<p className="text-[13px] text-muted-ink">Vérification de l&apos;accès…</p>}>
        <AdminGate>{children}</AdminGate>
      </Suspense>
    </div>
  );
}

async function AdminGate({ children }: { children: React.ReactNode }) {
  const session = await requireAdminPage();
  const newMessages = await countNewMessages(db);

  return (
    <>
      {/* `print:hidden` : le bon de préparation s'imprime sans le chrome d'admin. */}
      <header className="mb-8 border-b border-line pb-5 print:hidden">
        <div className="mb-2 flex items-center justify-between gap-4 text-[11px] uppercase tracking-[.2em] text-muted-ink">
          <span>Administration</span>
          <span className="flex items-center gap-4 normal-case tracking-normal">
            <span>{session.user.email}</span>
            <SignOutButton />
          </span>
        </div>
        <nav className="flex flex-wrap gap-5 text-[13px]">
          <Link href={adminRoutes.orders} className="underline underline-offset-4">
            Commandes
          </Link>
          <Link href="/admin/produits" className="underline underline-offset-4">
            Produits
          </Link>
          <Link href="/admin/lots" className="underline underline-offset-4">
            Lots
          </Link>
          <Link href="/admin/rappel" className="underline underline-offset-4">
            Rappel produit
          </Link>
          <Link href="/admin/codes-promo" className="underline underline-offset-4">
            Codes promo
          </Link>
          <Link href="/admin/livraison" className="underline underline-offset-4">
            Livraison
          </Link>
          <Link href="/admin/messages" className="underline underline-offset-4">
            Messages
            {newMessages > 0 && (
              <span className="ml-1 font-semibold">
                ({newMessages}
                <span className="sr-only"> non lus</span>)
              </span>
            )}
          </Link>
          <Link href="/admin/reglages" className="underline underline-offset-4">
            Réglages
          </Link>
          <Link href={adminRoutes.auditLog} className="underline underline-offset-4">
            Journal
          </Link>
          <Link href={adminRoutes.security} className="underline underline-offset-4">
            Sécurité
          </Link>
        </nav>
      </header>

      {children}
    </>
  );
}
