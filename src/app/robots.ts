import type { MetadataRoute } from "next";
import { buildRobots } from "@/lib/seo";

/**
 * `/robots.txt` (HEP-97) : en production, les chemins privés interdits et le
 * sitemap annoncé ; partout ailleurs, `Disallow: /`.
 */
export default function robots(): MetadataRoute.Robots {
  return buildRobots();
}
