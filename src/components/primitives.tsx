import Link from "next/link";
import { cn } from "@/lib/utils";

/** Small uppercase tracked label used above headings. */
export function Eyebrow({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "text-[11px] uppercase tracking-[.32em] text-muted-ink",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Eyebrow with the leading rule used on the hero / section intros. */
export function EyebrowRule({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-[14px] text-[11px] uppercase tracking-[.32em] text-muted-ink">
      <span className="h-px w-7 bg-[#bdbab4]" />
      {children}
    </div>
  );
}

export const btnFilled =
  "inline-flex cursor-pointer items-center justify-center border border-ink bg-ink px-[38px] py-[17px] text-[11.5px] font-semibold uppercase tracking-[.18em] text-white transition-colors hover:bg-paper hover:text-ink";

export const btnOutline =
  "inline-flex cursor-pointer items-center justify-center border border-line-dashed bg-transparent px-[38px] py-[17px] text-[11.5px] font-semibold uppercase tracking-[.18em] text-ink transition-colors hover:border-ink";

export const btnOutlineDark =
  "inline-flex cursor-pointer items-center justify-center border border-[#3a3a3a] bg-transparent px-[36px] py-4 text-[11.5px] font-semibold uppercase tracking-[.18em] text-cream transition-colors hover:border-cream";

export const textLink =
  "inline-flex cursor-pointer border-b border-ink pb-[5px] text-[11.5px] font-semibold uppercase tracking-[.16em] text-ink";

export function LinkFilled({
  href,
  children,
  className,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Link href={href} className={cn(btnFilled, className)}>
      {children}
    </Link>
  );
}
