import type { Metadata } from "next";

/**
 * Racine de `/admin` : connexion, activation du TOTP et back-office.
 *
 * Aucune page d'administration ne doit être indexée, y compris la page de
 * connexion — d'où la directive ici, au-dessus de tout le reste. Le proxy
 * pose en plus l'en-tête `X-Robots-Tag` (cf. `vercel.ts`).
 */
export const metadata: Metadata = {
  title: "Administration",
  robots: { index: false, follow: false, nocache: true },
};

export default function AdminRootLayout({ children }: { children: React.ReactNode }) {
  return children;
}
