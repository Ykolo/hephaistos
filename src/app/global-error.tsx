"use client";

import * as Sentry from "@sentry/nextjs";
import Link from "next/link";
import { useEffect } from "react";

/**
 * Dernier filet : erreur dans le layout racine lui-même (HEP-38). Remplace
 * toute la page, d'où le `<html>` complet et l'absence du chrome du site.
 */
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="fr">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: "4rem 1.5rem", textAlign: "center" }}>
        <h1 style={{ fontWeight: 400 }}>Une erreur est survenue.</h1>
        <p>Merci de réessayer dans un instant.</p>
        <Link href="/">Retour à l&apos;accueil</Link>
      </body>
    </html>
  );
}
