import Link from "next/link";
import { routes } from "@/lib/routes";

const linkCls =
  "cursor-pointer bg-transparent text-left text-[13.5px] text-dust transition-colors hover:text-white";

const colTitle =
  "mb-[18px] text-[11px] uppercase tracking-[.2em] text-dust-faint";

export function Footer() {
  return (
    <footer className="bg-footer px-6 pb-10 pt-[clamp(56px,8vw,96px)] text-dust sm:px-14">
      <div className="mx-auto max-w-[1320px]">
        <div className="grid grid-cols-2 gap-x-[clamp(36px,5vw,64px)] gap-y-10 border-b border-coal-line pb-[clamp(44px,6vw,72px)] md:grid-cols-4">
          <div className="col-span-2 max-w-[380px] md:col-span-4 lg:col-span-1">
            <div className="mb-[18px] font-serif text-[1.7rem] tracking-[.14em] text-cream-bright">
              HÉPHAÏSTOS
            </div>
            <p className="m-0 font-serif text-[1.1rem] italic leading-[1.6] text-dust-mute">
              Se forger, chaque jour.
            </p>
          </div>

          <div>
            <div className={colTitle}>Boutique</div>
            <div className="flex flex-col items-start gap-3">
              <Link href={routes.shop} className={linkCls}>
                Les Fondations
              </Link>
              <Link href={routes.product("nettoyant")} className={linkCls}>
                Nettoyant Visage
              </Link>
              <Link href={routes.product("serum")} className={linkCls}>
                Sérum régulateur
              </Link>
              <Link href={routes.product("creme")} className={linkCls}>
                Crème hydratante
              </Link>
            </div>
          </div>

          <div>
            <div className={colTitle}>La maison</div>
            <div className="flex flex-col items-start gap-3">
              <Link href={routes.histoire} className={linkCls}>
                Histoire
              </Link>
              <Link href={routes.vision} className={linkCls}>
                Vision
              </Link>
              <Link href={routes.avis} className={linkCls}>
                Avis
              </Link>
              <Link href={routes.contact} className={linkCls}>
                Contact
              </Link>
            </div>
          </div>

          <div>
            <div className={colTitle}>Légal</div>
            <div className="flex flex-col items-start gap-3">
              <Link href={`${routes.legal}?tab=mentions`} className={linkCls}>
                Mentions légales
              </Link>
              <Link href={`${routes.legal}?tab=cgv`} className={linkCls}>
                CGV
              </Link>
              <Link href={`${routes.legal}?tab=confid`} className={linkCls}>
                Confidentialité
              </Link>
              <Link href={`${routes.legal}?tab=retour`} className={linkCls}>
                Retours
              </Link>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap justify-between gap-4 pt-[30px] text-[11.5px] tracking-[.06em] text-dust-faint">
          <span>© 2026 Héphaïstos Paris — Tous droits réservés.</span>
          <span>Paris, France · Propulsé par Shopify</span>
        </div>
      </div>
    </footer>
  );
}
