import type { Metadata } from "next";
import { Reveal } from "@/components/reveal";
import { Eyebrow } from "@/components/primitives";
import { CartPageContent } from "@/components/cart-page-content";

export const metadata: Metadata = {
  title: "Votre panier | Héphaïstos",
  description: "Les soins sélectionnés avant de finaliser votre commande.",
  // Une page de panier n'a rien à faire dans un index : son contenu est propre
  // à chaque visiteur et n'a aucune valeur de référencement.
  robots: { index: false, follow: true },
};

export default function CartPage() {
  return (
    <div className="mx-auto max-w-[1320px] px-5 pb-[clamp(80px,12vw,150px)] pt-[clamp(40px,7vw,90px)] sm:px-14">
      <Reveal>
        <Eyebrow className="mb-5">Votre sélection</Eyebrow>
      </Reveal>
      <Reveal delay={60}>
        <h1 className="m-0 mb-[clamp(32px,5vw,56px)] font-serif text-[clamp(2.2rem,5vw,3.4rem)] font-normal leading-none tracking-[-.02em]">
          Panier
        </h1>
      </Reveal>

      <CartPageContent />
    </div>
  );
}
