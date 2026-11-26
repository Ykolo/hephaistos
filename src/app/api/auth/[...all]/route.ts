import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/server/auth";

/**
 * Points d'entrée HTTP de Better Auth (HEP-62) : inscription, connexion,
 * vérification d'email, réinitialisation, TOTP. Tout passe par `auth.ts`,
 * y compris les quotas de connexion.
 */
export const { GET, POST } = toNextJsHandler(auth);
