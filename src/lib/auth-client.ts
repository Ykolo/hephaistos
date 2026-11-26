import { twoFactorClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

/**
 * Client Better Auth côté navigateur (HEP-78). Parle à `/api/auth/*` sur
 * l'origine courante : aucune URL à configurer, et rien de secret ici.
 */
export const authClient = createAuthClient({
  plugins: [twoFactorClient()],
});
