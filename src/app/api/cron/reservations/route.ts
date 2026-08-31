import { db } from "@/server/db";
import { releaseExpiredReservations } from "@/server/services/cart";

/**
 * Libération des réservations de stock échues (HEP-48).
 *
 * Route Handler et non Server Action : l'appel vient de l'extérieur, c'est la
 * convention posée en HEP-34. **Aucun cron Vercel ne la déclenche** — voir
 * `vercel.ts` pour le pourquoi. Elle attend un appelant, quel qu'il soit.
 *
 * ⚠️ Cette route ne libère **aucun** stock. La disponibilité se calcule avec
 * `reservedUntil > NOW()` (`reservedQty`) : une réservation échue cesse de
 * bloquer à la seconde près, que cette route tourne ou non. Ce qu'elle fait,
 * c'est **tenir l'historique** — remettre `reservedUntil` à null et poser le
 * mouvement `RELEASE` en face du `RESERVE` écrit à l'ajout au panier.
 *
 * Ne pas l'appeler pendant un mois ne casse donc rien de visible : le journal
 * des mouvements accumule des `RESERVE` sans `RELEASE`, et la question « pourquoi
 * ce produit paraissait-il indisponible mardi ? » devient plus difficile à
 * instruire. Ces deux motifs sont exclus de `stockFromMovements`, l'invariant de
 * cohérence du stock (HEP-41) n'est pas affecté.
 *
 * ⚠️ La réservation elle-même est un **confort d'affichage**, pas une garantie
 * de vente. Le décrément atomique de HEP-41 reste le seul rempart contre la
 * survente.
 */
export async function GET(request: Request) {
  // Vercel signe ses appels de cron avec CRON_SECRET. Sans ce contrôle,
  // n'importe qui pourrait déclencher la libération en boucle et vider les
  // réservations des clients en cours d'achat.
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return Response.json({ error: "Non autorisé." }, { status: 401 });
    }
  } else if (process.env.NODE_ENV === "production") {
    // Un cron non protégé en production est une porte ouverte : mieux vaut
    // qu'il refuse de fonctionner et que ça se voie.
    return Response.json(
      { error: "CRON_SECRET n'est pas configuré." },
      { status: 500 },
    );
  }

  try {
    const result = await releaseExpiredReservations(db);
    return Response.json({
      ok: true,
      releasedLines: result.released,
      releasedUnits: result.units,
      at: new Date().toISOString(),
    });
  } catch (error) {
    // TODO(HEP-38) : Sentry. Un cron muet qui échoue est pire qu'absent —
    // le stock se bloquerait sans que personne ne le sache.
    console.error("[cron.reservations]", error);
    return Response.json(
      { ok: false, error: "La libération a échoué." },
      { status: 500 },
    );
  }
}
