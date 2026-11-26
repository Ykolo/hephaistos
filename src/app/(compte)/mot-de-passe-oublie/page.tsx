import type { Metadata } from "next";
import Link from "next/link";
import { ForgotPasswordForm } from "@/components/account/account-forms";
import { AccountShell, asideLinkCls } from "@/components/account/shell";
import { accountRoutes } from "@/lib/routes";

export const metadata: Metadata = { title: "Mot de passe oublié" };

export default function ForgotPasswordPage() {
  return (
    <AccountShell
      eyebrow="Votre compte"
      title="Mot de passe oublié"
      intro={<p className="m-0">Indiquez votre adresse : nous vous enverrons un lien pour en choisir un nouveau.</p>}
      aside={
        <Link href={accountRoutes.signIn} className={asideLinkCls}>
          Retour à la connexion
        </Link>
      }
    >
      <ForgotPasswordForm />
    </AccountShell>
  );
}
