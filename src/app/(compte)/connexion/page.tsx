import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { SignInForm } from "@/components/account/account-forms";
import { AccountShell, asideLinkCls } from "@/components/account/shell";
import { safeReturnPath } from "@/lib/auth-messages";
import { accountRoutes, routes } from "@/lib/routes";
import { getSession } from "@/server/auth-guards";

export const metadata: Metadata = { title: "Connexion | Héphaïstos" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const NOTICES: Record<string, string> = {
  lien: "Ce lien de confirmation n'est plus valable. Connectez-vous : un nouveau lien vous sera envoyé.",
  compte: "Connectez-vous pour accéder à votre compte.",
};

export default function SignInPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <AccountShell
      eyebrow="Votre compte"
      title="Connexion"
      aside={
        <>
          <p className="m-0">
            Pas encore de compte ?{" "}
            <Link href={accountRoutes.signUp} className={asideLinkCls}>
              Créer un compte
            </Link>
          </p>
          <p className="m-0 mt-2 text-muted-ink">
            Un compte n&apos;est jamais nécessaire pour commander.{" "}
            <Link href={routes.shop} className={asideLinkCls}>
              Retour à la boutique
            </Link>
          </p>
        </>
      }
    >
      <Suspense fallback={null}>
        <SignInContent searchParams={searchParams} />
      </Suspense>
    </AccountShell>
  );
}

async function SignInContent({ searchParams }: { searchParams: SearchParams }) {
  const { suite, raison } = await searchParams;
  const next = safeReturnPath(suite, accountRoutes.home);
  if (await getSession()) redirect(next);
  const notice = typeof raison === "string" ? NOTICES[raison] : undefined;

  return (
    <>
      {notice && (
        <p className="mb-8 border border-gold/40 bg-gold/10 p-3 text-[12.5px] leading-[1.6] text-body">
          {notice}
        </p>
      )}
      <SignInForm next={next} />
    </>
  );
}
