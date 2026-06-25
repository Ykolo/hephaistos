import Link from "next/link";
import { CoverImage } from "@/components/cover-image";
import { Reveal } from "@/components/reveal";
import { Marquee } from "@/components/marquee";
import { NewsletterBand } from "@/components/newsletter-band";
import { ProductGrid } from "@/components/product-grid";
import {
  Eyebrow,
  EyebrowRule,
  LinkFilled,
  btnOutline,
  btnOutlineDark,
  textLink,
} from "@/components/primitives";
import { routes } from "@/lib/routes";
import { heroImages } from "@/lib/products";

const reviews = [
  {
    quote: "« Une routine que je tiens enfin. Simple, efficace, sans chichi. »",
  },
  {
    quote: "« Le sérum a vraiment matifié ma peau. Je ne brille plus à midi. »",
  },
  {
    quote: "« Des textures premium, un vrai geste quotidien que j'attends. »",
  },
];

export default function HomePage() {
  return (
    <div>
      {/* HERO */}
      <section className="grid min-h-[calc(100vh-108px)] grid-cols-1 bg-sand md:grid-cols-2">
        <div className="order-2 flex flex-col justify-center px-6 py-[clamp(48px,8vw,120px)] sm:px-[clamp(24px,6vw,90px)] md:order-1">
          <Reveal>
            <EyebrowRule>Soins visage — Homme</EyebrowRule>
          </Reveal>
          <Reveal delay={80} className="mt-[30px]">
            <h1 className="m-0 font-serif text-[clamp(3rem,7.5vw,6.4rem)] font-normal leading-[.98] tracking-[-.02em] text-ink">
              Se forger,
              <br />
              <em className="font-light italic">chaque jour.</em>
            </h1>
          </Reveal>
          <Reveal
            delay={160}
            className="mb-[42px] mt-7 max-w-[30ch] font-serif text-[clamp(1.05rem,1.5vw,1.3rem)] leading-[1.6] text-body"
          >
            La discipline comme forme de respect de soi. Des rituels simples,
            conçus pour les hommes qui se construisent.
          </Reveal>
          <Reveal delay={240} className="flex flex-wrap gap-4">
            <LinkFilled href={routes.shop}>Découvrir le rituel</LinkFilled>
            <Link href={routes.histoire} className={btnOutline}>
              Notre histoire
            </Link>
          </Reveal>
        </div>
        <div className="relative order-1 min-h-[46vh] overflow-hidden bg-sand-deep md:order-2">
          <CoverImage
            src={heroImages.home}
            alt="Héphaïstos"
            priority
            zoom
            sizes="(max-width: 768px) 100vw, 50vw"
          />
        </div>
      </section>

      <Marquee />

      {/* MANIFESTO */}
      <section className="mx-auto max-w-[1000px] px-6 py-[clamp(80px,14vw,170px)] text-center sm:px-14">
        <Reveal>
          <Eyebrow className="mb-[34px]">Le manifeste</Eyebrow>
        </Reveal>
        <Reveal
          delay={80}
          className="m-0 font-serif text-[clamp(1.5rem,3.4vw,2.5rem)] font-light leading-[1.42] tracking-[-.01em] text-ink-soft"
        >
          Prendre soin de soi n&apos;est pas une vanité. C&apos;est un acte de
          rigueur, de présence, d&apos;engagement envers ce que l&apos;on
          construit chaque jour.
        </Reveal>
        <Reveal
          delay={160}
          className="mx-auto mt-[42px] max-w-[54ch] font-serif text-[1.1rem] leading-[1.7] text-body"
        >
          Héphaïstos est né de cette conviction : que les rituels quotidiens les
          plus simples sont aussi les plus puissants. Trois gestes. Une
          discipline. Une meilleure version de soi.
        </Reveal>
      </section>

      {/* FEATURED PRODUCT */}
      <section className="bg-sand">
        <div className="mx-auto grid max-w-[1320px] grid-cols-1 items-center md:grid-cols-2">
          <div className="relative min-h-[60vh] overflow-hidden bg-sand-deep">
            <CoverImage
              src={heroImages.featured}
              alt="Sérum régulateur"
              sizes="(max-width: 768px) 100vw, 50vw"
            />
          </div>
          <Reveal className="px-7 py-[clamp(48px,7vw,100px)] sm:px-[clamp(28px,6vw,90px)]">
            <Eyebrow className="mb-[22px]">Le geste signature</Eyebrow>
            <h2 className="m-0 mb-[22px] font-serif text-[clamp(2rem,4vw,3.2rem)] font-normal leading-[1.05] tracking-[-.015em]">
              Sérum régulateur
              <br />
              de sébum
            </h2>
            <p className="m-0 mb-8 max-w-[42ch] font-serif text-[1.12rem] leading-[1.7] text-body">
              Équilibre. Pensé pour les peaux mixtes à grasses, il régule
              l&apos;excès de sébum et matifie sans assécher. Le cœur du rituel.
            </p>
            <div className="mb-[30px] flex items-baseline gap-[14px]">
              <span className="font-serif text-[1.6rem]">20€</span>
              <span className="text-[11px] uppercase tracking-[.2em] text-gold">
                Bientôt disponible
              </span>
            </div>
            <LinkFilled href={routes.product("serum")}>
              Voir le produit
            </LinkFilled>
          </Reveal>
        </div>
      </section>

      {/* COLLECTION */}
      <section className="mx-auto max-w-[1320px] px-5 py-[clamp(80px,12vw,150px)] sm:px-14">
        <Reveal className="mb-[clamp(40px,6vw,70px)] flex flex-wrap items-end justify-between gap-5">
          <div>
            <Eyebrow className="mb-[18px]">La collection</Eyebrow>
            <h2 className="m-0 font-serif text-[clamp(2.2rem,5vw,3.6rem)] font-normal leading-none tracking-[-.02em]">
              Les Fondations
            </h2>
          </div>
          <Link href={routes.shop} className={textLink}>
            Tout voir →
          </Link>
        </Reveal>
        <ProductGrid />
      </section>

      {/* SE FORGER EDITORIAL */}
      <section className="bg-ink text-cream">
        <div className="mx-auto grid max-w-[1320px] grid-cols-1 items-stretch md:grid-cols-2">
          <Reveal className="flex flex-col justify-center px-7 py-[clamp(56px,9vw,130px)] sm:px-[clamp(28px,6vw,90px)]">
            <Eyebrow className="mb-[30px] text-[#7d7a74]">Se forger</Eyebrow>
            <p className="m-0 mb-7 font-serif text-[clamp(1.5rem,3vw,2.3rem)] font-light leading-[1.4] text-cream-bright">
              « C&apos;est un choix de vie. La détermination que tu appliques à
              tout ce que tu es. »
            </p>
            <p className="m-0 mb-[38px] max-w-[46ch] font-serif text-[1.08rem] leading-[1.75] text-dust-soft">
              Ton corps, ton mental, ta progression. Héphaïstos est né pour les
              hommes qui se forgent — un rituel à la fois.
            </p>
            <Link
              href={routes.histoire}
              className={`${btnOutlineDark} self-start`}
            >
              Lire l&apos;histoire
            </Link>
          </Reveal>
          <div className="relative min-h-[50vh] overflow-hidden">
            <CoverImage
              src={heroImages.editorial}
              alt=""
              sizes="(max-width: 768px) 100vw, 50vw"
            />
          </div>
        </div>
      </section>

      {/* REVIEWS TEASER */}
      <section className="mx-auto max-w-[1100px] px-6 py-[clamp(80px,12vw,150px)] text-center sm:px-14">
        <Reveal>
          <Eyebrow className="mb-[34px]">Les premiers retours</Eyebrow>
        </Reveal>
        <div className="grid grid-cols-1 gap-[clamp(24px,4vw,56px)] text-left sm:grid-cols-3">
          {reviews.map((r, i) => (
            <Reveal
              key={i}
              delay={i * 80}
              className="border-t border-line pt-[26px]"
            >
              <div className="mb-4 tracking-[.2em] text-ink">★★★★★</div>
              <p className="m-0 mb-[18px] font-serif text-[1.15rem] leading-[1.6] text-ink-soft">
                {r.quote}
              </p>
              <div className="text-[11px] uppercase tracking-[.16em] text-muted-ink">
                Testeur — Programme pilote
              </div>
            </Reveal>
          ))}
        </div>
        <Reveal className="mt-12">
          <Link href={routes.avis} className={textLink}>
            Voir les avis &amp; avant / après →
          </Link>
        </Reveal>
      </section>

      <NewsletterBand />
    </div>
  );
}
