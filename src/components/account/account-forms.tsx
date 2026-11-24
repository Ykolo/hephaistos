"use client";

import Link from "next/link";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { authErrorMessage } from "@/lib/auth-messages";
import { accountRoutes, adminRoutes } from "@/lib/routes";
import { Field, FormError, Notice, submitCls, submitWith } from "./fields";

/**
 * Formulaires du compte client (HEP-63).
 *
 * Règle commune : aucun message ne dit si une adresse a un compte. « Mot de
 * passe oublié » et « inscription » répondent la même chose dans les deux
 * cas ; seule la connexion échoue, avec un message qui ne distingue pas
 * l'adresse inconnue du mauvais mot de passe.
 */

const linkCls = "border-b border-ink pb-[2px] text-ink";

function usePending() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return { pending, setPending, error, setError };
}

export function SignInForm({ next }: { next: string }) {
  const { pending, setPending, error, setError } = usePending();

  async function submit(form: FormData) {
    setPending(true);
    setError(null);
    const { data, error } = await authClient.signIn.email({
      email: String(form.get("email") ?? ""),
      password: String(form.get("password") ?? ""),
    });
    if (error) {
      setPending(false);
      return setError(authErrorMessage(error, "Connexion impossible. Réessayez."));
    }
    if (data && "twoFactorRedirect" in data && data.twoFactorRedirect) {
      // Seuls les comptes d'administration ont un second facteur : ils
      // terminent leur connexion sur l'écran qui sait le demander.
      return window.location.assign(adminRoutes.login);
    }
    // Rechargement complet : le panier fusionné et l'en-tête se relisent
    // avec le nouveau cookie, sans cache de routeur.
    window.location.assign(next);
  }

  return (
    <form onSubmit={submitWith(submit)} className="flex flex-col gap-[18px]">
      <FormError message={error} />
      <Field id="email" label="Email" type="email" autoComplete="email" required />
      <Field id="password" label="Mot de passe" type="password" autoComplete="current-password" required />
      <div className="flex flex-wrap items-center justify-between gap-4">
        <button type="submit" disabled={pending} className={submitCls}>
          {pending ? "Connexion…" : "Se connecter"}
        </button>
        <Link href={accountRoutes.forgotPassword} className={`mt-3 text-[12.5px] ${linkCls}`}>
          Mot de passe oublié ?
        </Link>
      </div>
    </form>
  );
}

export function SignUpForm() {
  const { pending, setPending, error, setError } = usePending();
  const [sentTo, setSentTo] = useState<string | null>(null);

  if (sentTo) {
    return (
      <Notice title="Vérifiez votre boîte mail.">
        <p className="m-0">
          Si <strong>{sentTo}</strong> peut recevoir un compte, un lien de confirmation vient d&apos;y
          être envoyé. Il est valable 24 heures.
        </p>
        <p className="m-0 mt-3 text-[13px] text-muted-ink">
          Rien reçu ? Regardez dans les indésirables, ou essayez de vous connecter : le lien est
          renvoyé à chaque tentative.
        </p>
      </Notice>
    );
  }

  async function submit(form: FormData) {
    setPending(true);
    setError(null);
    const email = String(form.get("email") ?? "").trim();
    const { error } = await authClient.signUp.email({
      name: String(form.get("name") ?? "").trim(),
      email,
      password: String(form.get("password") ?? ""),
      // Après le clic dans l'email : connecté, et sur l'espace client.
      callbackURL: `${accountRoutes.home}?bienvenue=1`,
    });
    setPending(false);
    if (error) return setError(authErrorMessage(error, "Inscription impossible. Réessayez."));
    // Même écran que l'adresse soit nouvelle ou déjà inscrite : Better Auth
    // répond pareil, et c'est le titulaire qui est prévenu par email.
    setSentTo(email);
  }

  return (
    <form onSubmit={submitWith(submit)} className="flex flex-col gap-[18px]">
      <FormError message={error} />
      <Field id="name" label="Prénom et nom" autoComplete="name" required maxLength={120} />
      <Field id="email" label="Email" type="email" autoComplete="email" required />
      <Field
        id="password"
        label="Mot de passe"
        type="password"
        autoComplete="new-password"
        required
        minLength={12}
        maxLength={128}
        hint="12 caractères au moins. Une phrase est plus simple à retenir qu'un mot compliqué."
      />
      <button type="submit" disabled={pending} className={submitCls}>
        {pending ? "Création…" : "Créer mon compte"}
      </button>
    </form>
  );
}

export function ForgotPasswordForm() {
  const { pending, setPending, error, setError } = usePending();
  const [sent, setSent] = useState(false);

  if (sent) {
    return (
      <Notice title="Demande envoyée.">
        <p className="m-0">
          Si un compte existe avec cette adresse, un lien pour choisir un nouveau mot de passe vient
          d&apos;y être envoyé. Il est valable une heure et ne sert qu&apos;une fois.
        </p>
      </Notice>
    );
  }

  async function submit(form: FormData) {
    setPending(true);
    setError(null);
    const { error } = await authClient.requestPasswordReset({
      email: String(form.get("email") ?? "").trim(),
      redirectTo: accountRoutes.resetPassword,
    });
    setPending(false);
    // Seul le quota dépassé est signalé : toute autre réponse est la même,
    // que l'adresse ait un compte ou non.
    if (error?.status === 429) return setError(authErrorMessage(error));
    setSent(true);
  }

  return (
    <form onSubmit={submitWith(submit)} className="flex flex-col gap-[18px]">
      <FormError message={error} />
      <Field id="email" label="Email" type="email" autoComplete="email" required />
      <button type="submit" disabled={pending} className={submitCls}>
        {pending ? "Envoi…" : "Recevoir le lien"}
      </button>
    </form>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const { pending, setPending, error, setError } = usePending();
  const [done, setDone] = useState(false);

  if (done) {
    return (
      <Notice title="Mot de passe changé.">
        <p className="m-0">
          Vos autres sessions ont été fermées. Connectez-vous avec votre nouveau mot de passe.
        </p>
        <p className="m-0 mt-5">
          <Link href={accountRoutes.signIn} className={linkCls}>
            Se connecter
          </Link>
        </p>
      </Notice>
    );
  }

  async function submit(form: FormData) {
    setPending(true);
    setError(null);
    const newPassword = String(form.get("password") ?? "");
    if (newPassword !== String(form.get("confirm") ?? "")) {
      setPending(false);
      return setError("Les deux mots de passe ne correspondent pas.");
    }
    const { error } = await authClient.resetPassword({ newPassword, token });
    setPending(false);
    if (error) return setError(authErrorMessage(error, "Changement impossible. Réessayez."));
    setDone(true);
  }

  return (
    <form onSubmit={submitWith(submit)} className="flex flex-col gap-[18px]">
      <FormError message={error} />
      <Field
        id="password"
        label="Nouveau mot de passe"
        type="password"
        autoComplete="new-password"
        required
        minLength={12}
        maxLength={128}
        hint="12 caractères au moins."
      />
      <Field id="confirm" label="Confirmer" type="password" autoComplete="new-password" required />
      <button type="submit" disabled={pending} className={submitCls}>
        {pending ? "Enregistrement…" : "Changer le mot de passe"}
      </button>
    </form>
  );
}

export function AccountSignOut() {
  const [pending, setPending] = useState(false);
  return (
    <button
      type="button"
      disabled={pending}
      className="cursor-pointer border-b border-ink pb-[2px] text-[12.5px] text-ink disabled:opacity-50"
      onClick={async () => {
        setPending(true);
        await authClient.signOut();
        window.location.assign("/");
      }}
    >
      Se déconnecter
    </button>
  );
}
