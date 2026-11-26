import type { Metadata } from "next";
import Link from "next/link";
import { SignUpForm } from "@/components/account/account-forms";
import { AccountShell, asideLinkCls } from "@/components/account/shell";
import { accountRoutes } from "@/lib/routes";

export const metadata: Metadata = { title: "Créer un compte" };

export default function SignUpPage() {
  return (
    <AccountShell
      eyebrow="Votre compte"
      title="Créer un compte"
      intro={
        <p className="m-0">
          Pour retrouver vos commandes et vos factures. Un compte n&apos;est jamais nécessaire pour
          commander : vos commandes passées avec la même adresse apparaîtront dans votre compte dès
          qu&apos;elle sera confirmée.
        </p>
      }
      aside={
        <p className="m-0">
          Déjà un compte ?{" "}
          <Link href={accountRoutes.signIn} className={asideLinkCls}>
            Se connecter
          </Link>
        </p>
      }
    >
      <SignUpForm />
    </AccountShell>
  );
}
