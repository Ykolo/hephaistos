import { createHash } from "node:crypto";
import { headers } from "next/headers";

/**
 * Adresse IP du client — uniquement sous forme **hachée** (HEP-35).
 *
 * Une IP est une donnée personnelle au sens du RGPD. Elle n'est jamais stockée
 * ni journalisée en clair : ni en base (`ipHash` de `Message`, `Subscriber`,
 * `Review`), ni dans les clés Redis du rate limiting.
 */

/**
 * IP brute de la requête courante. Ne sort pas de ce module autrement que
 * hachée — d'où l'absence d'export.
 *
 * Sur Vercel, `x-real-ip` est posé par la plateforme et ne peut pas être
 * forgé par le client ; `x-forwarded-for` sert de repli hors Vercel, sa
 * première valeur étant le client d'origine.
 */
async function clientIp(): Promise<string> {
  const h = await headers();
  return (
    h.get("x-real-ip") ??
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}

/**
 * SHA-256 salé. Sans sel, le hachage d'une IPv4 se renverse en quelques
 * minutes (il n'en existe que 4 milliards) : le sel est ce qui en fait une
 * pseudonymisation plutôt qu'un simple encodage.
 */
export function hashIp(ip: string): string {
  const salt = process.env.IP_HASH_SALT;
  if (!salt) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("IP_HASH_SALT est absent : impossible de hacher une IP.");
    }
    // En local et en test, un sel fixe suffit : aucune IP réelle n'y passe.
    return sha256(`dev-salt:${ip}`);
  }
  return sha256(`${salt}:${ip}`);
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** IP hachée de la requête courante — la seule forme qui quitte ce module. */
export async function currentIpHash(): Promise<string> {
  return hashIp(await clientIp());
}
