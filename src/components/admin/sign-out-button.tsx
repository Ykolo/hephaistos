"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { adminRoutes } from "@/lib/routes";

export function SignOutButton() {
  const [pending, setPending] = useState(false);

  return (
    <button
      type="button"
      disabled={pending}
      className="underline underline-offset-4 disabled:opacity-50"
      onClick={async () => {
        setPending(true);
        await authClient.signOut();
        // Rechargement complet : aucune donnée d'admin ne reste dans le
        // cache du routeur après la déconnexion.
        window.location.assign(adminRoutes.login);
      }}
    >
      Se déconnecter
    </button>
  );
}
