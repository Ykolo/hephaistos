import type { Metadata } from "next";
import { Newsreader, Archivo } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import { SiteChrome } from "@/components/site-chrome";
import { Suspense } from "react";
import { SearchOverlayData } from "@/components/search-overlay-data";
import { canonicalOrigin } from "@/lib/seo";
import { SITE_NAME, SITE_TAGLINE } from "@/lib/metadata";
import { FooterCompany } from "@/components/footer-company";

const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
  weight: ["300", "400", "500"],
  style: ["normal", "italic"],
  display: "swap",
});

const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
});

/**
 * Métadonnées par défaut (HEP-98). `metadataBase` rend absolues les
 * canoniques et les images de partage déclarées en chemins relatifs par les
 * pages ; c'est l'origine de **production**, même sur une preview.
 */
export const metadata: Metadata = {
  metadataBase: new URL(canonicalOrigin()),
  title: {
    default: `${SITE_NAME} — ${SITE_TAGLINE}`,
    template: `%s — ${SITE_NAME}`,
  },
  description:
    "Soins visage pour homme. Des rituels simples, conçus pour les hommes qui se construisent. Fabriqué en France, formules clean.",
  applicationName: SITE_NAME,
  openGraph: { siteName: SITE_NAME, locale: "fr_FR", type: "website" },
  twitter: { card: "summary_large_image" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="fr"
      className={`${newsreader.variable} ${archivo.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-paper text-ink">
        <Providers>
          <SiteChrome
            searchSlot={
              <Suspense fallback={null}>
                <SearchOverlayData />
              </Suspense>
            }
            companySlot={
              <Suspense fallback={<span>Héphaïstos Paris</span>}>
                <FooterCompany />
              </Suspense>
            }
          >
            {children}
          </SiteChrome>
        </Providers>
      </body>
    </html>
  );
}
