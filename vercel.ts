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

  // PAS de `crons` ici, et c'est délibéré.
  //
  // Un `*/5 * * * *` a été déclaré en HEP-48 puis retiré : **sur le plan Hobby,
  // un cron ne peut tourner qu'une fois par jour**, et une expression plus
  // fréquente fait échouer le DÉPLOIEMENT — pas seulement le cron. Quatorze
  // commits sont partis en échec avant qu'on s'en aperçoive, parce que rien ne
  // le signale à part une croix sur le commit.
  //
  // Ce n'est pas grave sur le fond : `/api/cron/reservations` ne libère aucun
  // stock. La disponibilité se calcule avec `reservedUntil > NOW()`
  // (`reservedQty`, HEP-48), donc une réservation échue cesse de bloquer à la
  // seconde près, sans que rien ne tourne. La route ne fait que l'écriture
  // d'historique : remettre `reservedUntil` à null et poser le mouvement
  // `RELEASE` en face du `RESERVE`.
  //
  // Elle reste appelable de l'extérieur, protégée par CRON_SECRET. Avant de
  // redéclarer un cron ici, vérifier le plan du compte.

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
