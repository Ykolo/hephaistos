import type { NextConfig } from "next";

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

export default nextConfig;
