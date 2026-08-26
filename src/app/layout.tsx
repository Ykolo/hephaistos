import type { Metadata } from "next";
import { Newsreader, Archivo } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import { SiteChrome } from "@/components/site-chrome";
import { Suspense } from "react";
import { SearchOverlayData } from "@/components/search-overlay-data";

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

export const metadata: Metadata = {
  title: "Héphaïstos — Se forger, chaque jour.",
  description:
    "Soins visage pour homme. Des rituels simples, conçus pour les hommes qui se construisent. Fabriqué en France, formules clean.",
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
          >
            {children}
          </SiteChrome>
        </Providers>
      </body>
    </html>
  );
}
