import type { Metadata } from "next";
import Link from "next/link";
import { guardAdminPage } from "@/server/admin-guard";

/**
 * L'administration ne doit jamais être indexée, quelles que soient les
 * protections en place par ailleurs.
 */
export const metadata: Metadata = {
  title: "Administration | Héphaïstos",
  robots: { index: false, follow: false, nocache: true },
};

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  guardAdminPage();

  return (
    <div className="mx-auto max-w-[1100px] px-5 py-10 sm:px-10">
      <header className="mb-8 border-b border-line pb-5">
        <div className="mb-2 text-[11px] uppercase tracking-[.2em] text-muted-ink">
          Administration
        </div>
        <nav className="flex gap-5 text-[13px]">
          <Link href="/admin/produits" className="underline underline-offset-4">
            Produits
          </Link>
        </nav>
      </header>

      {/*
        Bandeau volontairement voyant : tant que HEP-78 n'est pas fait, cet
        écran n'a aucune authentification. Il ne doit pas être pris pour un
        back-office terminé.
      */}
      <p className="mb-8 border border-gold/40 bg-gold/10 p-3 text-[12.5px] leading-[1.6] text-body">
        <strong>Accès non protégé.</strong> Cet écran n&apos;est ouvert
        qu&apos;en local, via <code>ADMIN_UNSAFE_LOCAL=1</code>.
        L&apos;authentification et la 2FA arrivent avec HEP-62 et HEP-78.
      </p>

      {children}
    </div>
  );
}
