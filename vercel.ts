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
