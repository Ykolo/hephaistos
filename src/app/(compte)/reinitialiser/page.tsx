import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ResetPasswordForm } from "@/components/account/account-forms";
import { Notice } from "@/components/account/fields";
import { AccountShell, asideLinkCls } from "@/components/account/shell";
import { accountRoutes } from "@/lib/routes";

export const metadata: Metadata = { title: "Nouveau mot de passe" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * Arrivée depuis le lien de l'email. Better Auth vérifie le jeton avant de
 * rediriger ici : `?token=…` s'il est valable, `?error=INVALID_TOKEN` sinon
 * (expiré, inconnu, ou déjà utilisé).
 */
export default function ResetPasswordPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <AccountShell eyebrow="Votre compte" title="Nouveau mot de passe">
      <Suspense fallback={null}>
        <ResetContent searchParams={searchParams} />
      </Suspense>
    </AccountShell>
  );
}

async function ResetContent({ searchParams }: { searchParams: SearchParams }) {
  const { token, error } = await searchParams;
  if (error || typeof token !== "string" || token.length === 0) {
    return (
      <Notice title="Lien expiré.">
        <p className="m-0">
          Ce lien n&apos;est plus valable : il dure une heure et ne sert qu&apos;une fois.
        </p>
        <p className="m-0 mt-5">
          <Link href={accountRoutes.forgotPassword} className={asideLinkCls}>
            Demander un nouveau lien
          </Link>
        </p>
      </Notice>
    );
  }
  return <ResetPasswordForm token={token} />;
}
