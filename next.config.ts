import type { NextConfig } from "next";
import { withBotId } from "botid/next/config";

const nextConfig: NextConfig = {
  reactCompiler: true,
  // Requis par `use cache` / `cacheTag` dans src/server/catalog.ts (HEP-45) :
  // le catalogue est lu en base mais rendu comme du statique, et invalidé par
  // étiquette à chaque écriture admin plutôt qu'au redéploiement.
  cacheComponents: true,
  images: {
    remotePatterns: [
      // Vercel Blob — destination des images produit (HEP-43). Le motif est
      // volontairement générique : changer de store ne doit pas casser les
      // images.
      {
        protocol: "https",
        hostname: "*.public.blob.vercel-storage.com",
      },
      // ⚠️ CDN Shopify — à RETIRER une fois `bun run images:migrate` passé et
      // vérifié. Shopify est abandonné : tant que cette ligne est là, le site
      // dépend d'une plateforme qui peut couper ces URL sans préavis.
      {
        protocol: "https",
        hostname: "hephaistosparis.com",
        pathname: "/cdn/**",
      },
    ],
  },
};

// BotID (HEP-35) : ajoute les réécritures qui relaient le défi invisible vers
// Vercel depuis notre propre domaine. Leur préfixe est exclu des en-têtes de
// sécurité globaux dans `vercel.ts`.
export default withBotId(nextConfig);
