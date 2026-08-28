"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { routes, mainNav } from "@/lib/routes";
import { useUIStore } from "@/store/ui-store";
import { CartBadge } from "@/components/cart-badge";

function NavLink({
  href,
  label,
  active,
}: {
  href: string;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "border-b py-1 text-[11.5px] font-medium uppercase tracking-[.16em] text-ink",
        active ? "border-ink" : "border-transparent",
      )}
    >
      {label}
    </Link>
  );
}

export function Header() {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const openMenu = useUIStore((s) => s.openMenu);
  const openSearch = useUIStore((s) => s.openSearch);
  const openCart = useUIStore((s) => s.openCart);

  const isHome = pathname === routes.home;
  const solid = scrolled || !isHome;

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "sticky top-0 z-[800] border-b transition-[background,box-shadow,border-color] duration-[400ms]",
        solid
          ? "border-line-soft bg-paper/90 backdrop-blur-[10px]"
          : "border-transparent bg-transparent",
      )}
    >
      <div className="mx-auto flex h-[60px] max-w-[1320px] items-center justify-between gap-6 px-5 sm:h-[74px] sm:px-14">
        {/* left: burger (mobile) / links (desktop) */}
        <div className="flex flex-1 items-center gap-[34px]">
          <button
            onClick={openMenu}
            aria-label="Menu"
            className="flex cursor-pointer flex-col gap-[5px] py-1.5 min-[860px]:hidden"
          >
            <span className="block h-[1.5px] w-6 bg-ink" />
            <span className="block h-[1.5px] w-6 bg-ink" />
          </button>
          <nav className="hidden items-center gap-[30px] min-[860px]:flex">
            {mainNav.map((item) => (
              <NavLink
                key={item.href}
                href={item.href}
                label={item.label}
                active={pathname.startsWith(item.href)}
              />
            ))}
          </nav>
        </div>

        {/* center: wordmark */}
        <Link
          href={routes.home}
          className="shrink-0 whitespace-nowrap font-serif text-[clamp(19px,2.4vw,26px)] font-normal leading-none tracking-[.14em] text-ink"
        >
          HÉPHAÏSTOS
        </Link>

        {/* right: contact + icons */}
        <div className="flex flex-1 items-center justify-end gap-5">
          <div className="hidden min-[860px]:block">
            <NavLink
              href={routes.contact}
              label="Contact"
              active={pathname.startsWith(routes.contact)}
            />
          </div>
          <button
            onClick={openSearch}
            aria-label="Recherche"
            className="flex cursor-pointer p-1"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#141414"
              strokeWidth="1.4"
            >
              <circle cx="11" cy="11" r="7" />
              <line x1="16.5" y1="16.5" x2="21" y2="21" />
            </svg>
          </button>
          <CartBadge onOpen={openCart} />
        </div>
      </div>
    </header>
  );
}
