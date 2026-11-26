import { Suspense } from "react";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { TwoFactorSetup } from "@/components/admin/two-factor-setup";
import { adminRoutes } from "@/lib/routes";
import { checkAdminAccess, denialRedirect } from "@/server/admin-guard";

/**
 * Double authentification de l'administration (HEP-78).
 *
 * Seule page ouverte à un admin **sans** TOTP : c'est ici qu'il l'active, et
 * il n'a accès à rien d'autre tant que ce n'est pas fait.
 */
export default function AdminSecurityPage() {
  return (
    <div className="mx-auto max-w-[520px] px-5 py-16">
      <div className="mb-2 text-[11px] uppercase tracking-[.2em] text-muted-ink">Administration</div>
      <h1 className="m-0 mb-8 font-serif text-[28px] font-normal">Double authentification</h1>
      <Suspense fallback={<p className="text-[13px] text-muted-ink">Chargement…</p>}>
        <SecurityContent />
      </Suspense>
    </div>
  );
}

async function SecurityContent() {
  const access = await checkAdminAccess(await headers(), { allowWithout2fa: true });
  if (!access.ok) {
    const target = denialRedirect(access.reason, adminRoutes.security);
    if (!target) notFound();
    redirect(target);
  }

  if (access.session.user.twoFactorEnabled) {
    return (
      <div className="grid gap-4 text-[14px] leading-[1.7] text-body">
        <p className="m-0">
          La double authentification est <strong>active</strong> sur ce compte. Chaque connexion
          demande le code de votre application d&apos;authentification.
        </p>
        <p className="m-0">
          Téléphone perdu : connectez-vous avec un de vos codes de secours. Plus de codes du tout :
          un autre administrateur doit réinitialiser votre accès en base.
        </p>
        <Link href={adminRoutes.orders} className="underline underline-offset-4">
          Retour à l&apos;administration
        </Link>
      </div>
    );
  }

  return <TwoFactorSetup />;
}
