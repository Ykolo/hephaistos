import { initBotId } from "botid/client/core";

/**
 * Pages dont les formulaires sont protégés par Vercel BotID (HEP-35).
 *
 * Une Server Action est un `POST` sur l'URL de la page qui la déclenche : c'est
 * donc la **page** qui figure ici, pas l'action. Toute action déclarée avec
 * `botProtection: true` doit avoir sa page dans cette liste — sinon le jeton
 * n'est pas envoyé et `checkBotId()` prend chaque visiteur pour un robot.
 *
 * À compléter au fil des lots : newsletter (HEP-67), avis (HEP-90),
 * inscription (HEP-63).
 */
initBotId({
  protect: [{ path: "/contact", method: "POST" }],
});
