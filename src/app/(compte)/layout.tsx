import type { Metadata } from "next";

/**
 * Pages du compte client (HEP-63). Rien à indexer : ni les formulaires, ni
 * — surtout — l'espace client.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return children;
}
