import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  // Requis par `use cache` / `cacheTag` dans src/server/catalog.ts (HEP-45) :
  // le catalogue est lu en base mais rendu comme du statique, et invalidé par
  // étiquette à chaque écriture admin plutôt qu'au redéploiement.
  cacheComponents: true,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "hephaistosparis.com",
        pathname: "/cdn/**",
      },
    ],
  },
};

export default nextConfig;
