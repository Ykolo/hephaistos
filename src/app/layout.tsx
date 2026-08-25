import type { Metadata } from "next";
import { Newsreader, Archivo } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import { SiteChrome } from "@/components/site-chrome";
import { getProducts } from "@/server/catalog";

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

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const products = await getProducts();
  const searchProducts = products.map((p) => ({
    slug: p.slug,
    name: p.name,
    priceCents: p.priceCents,
  }));

  return (
    <html
      lang="fr"
      className={`${newsreader.variable} ${archivo.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-paper text-ink">
        <Providers>
          <SiteChrome searchProducts={searchProducts}>{children}</SiteChrome>
        </Providers>
      </body>
    </html>
  );
}
