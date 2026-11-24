"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";

type Step = "password" | "totp" | "backup";

/** Messages de Better Auth traduits — jamais le texte anglais brut. */
function messageFor(error: { code?: string; status?: number } | null | undefined): string {
  if (!error) return "Connexion impossible. Réessayez.";
  if (error.status === 429) return "Trop de tentatives. Réessayez dans quelques minutes.";
  switch (error.code) {
    case "INVALID_EMAIL_OR_PASSWORD":
      return "Email ou mot de passe incorrect.";
    case "EMAIL_NOT_VERIFIED":
      return "Adresse non confirmée : un nouveau lien vient de vous être envoyé.";
    case "INVALID_CODE":
    case "INVALID_TWO_FACTOR_CODE":
      return "Code incorrect.";
    case "INVALID_BACKUP_CODE":
      return "Code de secours incorrect ou déjà utilisé.";
    case "TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE":
    case "ACCOUNT_LOCKED":
      return "Trop d'essais : le compte est temporairement verrouillé.";
    default:
      return "Connexion impossible. Réessayez.";
  }
}

/**
 * Deux étapes : mot de passe, puis code de l'application d'authentification.
 * La session n'existe qu'après la seconde — Better Auth ne la crée pas tant
 * que le code n'est pas vérifié.
 */
export function AdminLoginForm({ next }: { next: string }) {
  const [step, setStep] = useState<Step>("password");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  // Rechargement complet plutôt que `router.push` : le proxy et le layout
  // relisent la session fraîchement posée, sans cache de routeur.
  const done = () => window.location.assign(next);

  async function submitPassword(form: FormData) {
    setPending(true);
    setError(null);
    const { data, error } = await authClient.signIn.email({
      email: String(form.get("email") ?? ""),
      password: String(form.get("password") ?? ""),
    });
    setPending(false);
    if (error) return setError(messageFor(error));
    if (data && "twoFactorRedirect" in data && data.twoFactorRedirect) return setStep("totp");
    // Pas de TOTP : le proxy enverra vers son activation, ou vers un 404
    // pour un compte qui n'est pas admin.
    done();
  }

  async function submitCode(form: FormData) {
    setPending(true);
    setError(null);
    const code = String(form.get("code") ?? "").replace(/\s+/g, "");
    const { error } =
      step === "totp"
        ? await authClient.twoFactor.verifyTotp({ code })
        : await authClient.twoFactor.verifyBackupCode({ code });
    setPending(false);
    if (error) return setError(messageFor(error));
    done();
  }

  if (step === "password") {
    return (
      <form action={submitPassword} className="grid gap-4">
        <div className="grid gap-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" autoComplete="username" required />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="password">Mot de passe</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </div>
        {error && <p role="alert" className="m-0 text-[13px] text-destructive">{error}</p>}
        <Button type="submit" disabled={pending}>
          {pending ? "Connexion…" : "Continuer"}
        </Button>
      </form>
    );
  }

  return (
    <form action={submitCode} className="grid gap-4">
      <div className="grid gap-1.5">
        <Label htmlFor="code">
          {step === "totp" ? "Code de l'application d'authentification" : "Code de secours"}
        </Label>
        <Input
          id="code"
          name="code"
          inputMode={step === "totp" ? "numeric" : "text"}
          autoComplete="one-time-code"
          autoFocus
          required
        />
      </div>
      {error && <p role="alert" className="m-0 text-[13px] text-destructive">{error}</p>}
      <Button type="submit" disabled={pending}>
        {pending ? "Vérification…" : "Se connecter"}
      </Button>
      <button
        type="button"
        className="justify-self-start text-[12px] text-muted-ink underline underline-offset-4"
        onClick={() => {
          setError(null);
          setStep(step === "totp" ? "backup" : "totp");
        }}
      >
        {step === "totp" ? "Utiliser un code de secours" : "Utiliser l'application"}
      </button>
    </form>
  );
}
