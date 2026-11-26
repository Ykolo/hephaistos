"use client";

import { useState } from "react";
import QRCode from "qrcode";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { submitWith } from "@/components/account/fields";
import { authClient } from "@/lib/auth-client";
import { adminRoutes } from "@/lib/routes";

type Enrollment = { qr: string; secret: string; backupCodes: string[] };

/**
 * Activation du TOTP en trois temps : confirmer le mot de passe, scanner le
 * QR code, saisir un premier code. Le second facteur n'est actif qu'après ce
 * dernier code — un QR code scanné de travers ne verrouille personne dehors.
 */
export function TwoFactorSetup() {
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function start(form: FormData) {
    setPending(true);
    setError(null);
    const { data, error } = await authClient.twoFactor.enable({
      password: String(form.get("password") ?? ""),
    });
    // Seule la méthode TOTP est configurée côté serveur ; un code par email
    // (`otp`) ne serait pas un second facteur indépendant du mot de passe.
    if (error || !data || data.method !== "totp") {
      setPending(false);
      return setError(
        error?.code === "INVALID_PASSWORD" ? "Mot de passe incorrect." : "Activation impossible. Réessayez.",
      );
    }
    const secret = new URL(data.totpURI).searchParams.get("secret") ?? "";
    // QR code généré dans le navigateur : le secret ne transite par aucun
    // service tiers de génération d'image.
    const qr = await QRCode.toDataURL(data.totpURI, { margin: 1, width: 220 });
    setEnrollment({ qr, secret, backupCodes: data.backupCodes });
    setPending(false);
  }

  async function confirm(form: FormData) {
    setPending(true);
    setError(null);
    const { error } = await authClient.twoFactor.verifyTotp({
      code: String(form.get("code") ?? "").replace(/\s+/g, ""),
    });
    setPending(false);
    if (error) return setError("Code incorrect. Vérifiez l'heure de votre téléphone et réessayez.");
    window.location.assign(adminRoutes.orders);
  }

  if (!enrollment) {
    return (
      <form onSubmit={submitWith(start)} className="grid gap-4 text-[14px] leading-[1.7] text-body">
        <p className="m-0">
          L&apos;administration exige un code à usage unique en plus du mot de passe. Installez une
          application d&apos;authentification (1Password, Google Authenticator, Authy…), puis
          confirmez votre mot de passe pour commencer.
        </p>
        <div className="grid gap-1.5">
          <Label htmlFor="password">Mot de passe</Label>
          <Input id="password" name="password" type="password" autoComplete="current-password" required />
        </div>
        {error && <p role="alert" className="m-0 text-[13px] text-destructive">{error}</p>}
        <Button type="submit" disabled={pending}>
          {pending ? "Préparation…" : "Continuer"}
        </Button>
      </form>
    );
  }

  return (
    <form onSubmit={submitWith(confirm)} className="grid gap-5 text-[14px] leading-[1.7] text-body">
      <div>
        <p className="m-0 mb-3">1. Scannez ce QR code avec votre application.</p>
        {/* eslint-disable-next-line @next/next/no-img-element -- data URL générée localement */}
        <img src={enrollment.qr} alt="QR code de la double authentification" width={220} height={220} />
        <p className="m-0 mt-2 text-[12px] text-muted-ink">
          Sans appareil photo, saisissez cette clé :{" "}
          <code className="break-all">{enrollment.secret}</code>
        </p>
      </div>

      <div>
        <p className="m-0 mb-2">
          2. Conservez ces codes de secours <strong>hors de ce téléphone</strong> (gestionnaire de
          mots de passe). Chacun ne sert qu&apos;une fois et remplace le code si le téléphone est perdu.
        </p>
        <ul className="m-0 grid list-none grid-cols-2 gap-1 p-0 font-mono text-[13px]">
          {enrollment.backupCodes.map((code) => (
            <li key={code}>{code}</li>
          ))}
        </ul>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="code">3. Saisissez le code affiché par l&apos;application</Label>
        <Input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" required />
      </div>
      {error && <p role="alert" className="m-0 text-[13px] text-destructive">{error}</p>}
      <Button type="submit" disabled={pending}>
        {pending ? "Vérification…" : "Activer la double authentification"}
      </Button>
    </form>
  );
}
