import type { VercelConfig } from "@vercel/config/v1";

/**
 * Configuration de déploiement Héphaïstos (HEP-32).
 *
 * Le provisioning lui-même — Neon, Upstash, Blob, domaine — se fait avec la
 * CLI (`vercel integration add …`) : c'est ce qui injecte les variables
 * d'environnement et unifie la facturation. Ce fichier ne couvre que ce qui
 * doit être versionné et relu en revue.
 */
export const config: VercelConfig = {
  framework: "nextjs",
  buildCommand: "bun run build",

  /**
   * Fonctions à Paris. La marque est française, la base est en `eu-central-1`
   * et les données sont personnelles : exécuter ailleurs ajoute un aller-retour
   * transatlantique à chaque opération de panier et alourdit le dossier RGPD.
   */
  regions: ["cdg1"],

  /**
   * Ménage des réservations de stock échues (HEP-48).
   *
   * ⚠️ **Une fois par jour, et pas davantage.** Sur le plan Hobby, un cron ne
   * peut tourner qu'une fois par jour ; une expression plus fréquente ne
   * dégrade pas le cron, elle fait échouer le **déploiement entier**. Le
   * « toutes les 5 minutes » posé en HEP-48 a bloqué quatorze commits
   * d'affilée sans que personne ne le voie — rien ne le signale à part une
   * croix sur le commit. Avant de toucher à cette cadence, vérifier le plan
   * du compte.
   *
   * Le quotidien suffit, et ce n'est pas un pis-aller : cette route **ne
   * libère aucun stock**. La disponibilité se calcule avec
   * `reservedUntil > NOW()` (`reservedQty`), donc une réservation échue cesse
   * de bloquer à la seconde près, sans que rien ne tourne. La definition of
   * done de HEP-48 — « un panier abandonné rend son stock en moins de 35
   * minutes » — est tenue par la requête, pas par le cron. Ce dernier ne fait
   * que tenir l'historique : remettre `reservedUntil` à null et poser le
   * mouvement `RELEASE` en face du `RESERVE`. Un journal d'audit n'a pas
   * besoin d'être écrit à la minute.
   *
   * 4 h du matin : le creux de trafic. Sur Hobby, la précision est de ±59 min,
   * ce qui est sans importance ici.
   */
  crons: [{ path: "/api/cron/reservations", schedule: "0 4 * * *" }],

  headers: [
    {
      /**
       * Aucune preview ne doit être indexée : une URL de préproduction qui
       * remonte dans Google affiche des prix faux et du contenu de test sous
       * le nom de la marque. Vercel Authentication bloque déjà l'accès ; cet
       * en-tête est la seconde barrière, pour le jour où la protection sera
       * levée le temps d'une démonstration à Jules.
       *
       * Le filtre porte sur l'hôte et non sur l'environnement : `has`
       * n'accepte que `host`, `header`, `cookie` et `query`. Les previews
       * vivent toutes sur `*.vercel.app`, la production sur le domaine de la
       * marque — la distinction est donc exacte.
       */
      source: "/(.*)",
      has: [{ type: "host", value: { suf: ".vercel.app" } }],
      headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
    },
  ],

  // À FAIRE (HEP-32) : redirection apex ↔ www.
  // La direction n'est pas tranchée et le choix engage les canoniques SEO
  // (lot 13), le périmètre du certificat et le domaine des cookies. Une règle
  // posée au hasard ici produirait soit une boucle de redirection, soit un
  // changement d'URL après indexation. À arbitrer avec Jules, puis à déclarer
  // dans les réglages de domaine du projet Vercel.
  //
  // Les en-têtes de sécurité (CSP, HSTS, X-Frame-Options) relèvent de HEP-35
  // et sont volontairement absents ici pour ne pas être posés à moitié.
};

export default config;
