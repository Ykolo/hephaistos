import { Eyebrow } from "@/components/primitives";

/** Mise en page commune aux pages du compte : une colonne étroite, au calme. */
export function AccountShell({
  eyebrow,
  title,
  intro,
  children,
  aside,
}: {
  eyebrow: string;
  title: string;
  intro?: React.ReactNode;
  children: React.ReactNode;
  aside?: React.ReactNode;
}) {
  return (
    <section className="mx-auto max-w-[520px] px-6 py-[clamp(70px,10vw,130px)] sm:px-14">
      <Eyebrow className="mb-6">{eyebrow}</Eyebrow>
      <h1 className="m-0 mb-[26px] font-serif text-[clamp(2.2rem,5vw,3.2rem)] font-normal leading-none tracking-[-.02em]">
        {title}
      </h1>
      {intro && <div className="m-0 mb-10 text-[15px] leading-[1.75] text-body">{intro}</div>}
      {children}
      {aside && <div className="mt-10 text-[13.5px] leading-[1.7] text-body">{aside}</div>}
    </section>
  );
}

export const asideLinkCls = "border-b border-ink pb-[2px] text-ink";
