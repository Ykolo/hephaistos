"use client";

import { useState } from "react";
import { Reveal } from "@/components/reveal";

export function NewsletterHeroForm() {
  const [sent, setSent] = useState(false);

  if (sent) {
    return (
      <Reveal className="font-serif text-[1.4rem] text-cream-bright">
        Tu es sur la liste. ✦
      </Reveal>
    );
  }

  return (
    <Reveal>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setSent(true);
        }}
        className="mx-auto flex max-w-[440px] border-b border-[#3a3a3a]"
      >
        <input
          type="email"
          required
          placeholder="Ton adresse email"
          className="flex-1 bg-transparent px-1 py-4 text-[15px] text-cream outline-none"
        />
        <button
          type="submit"
          className="cursor-pointer bg-transparent px-2 text-[11.5px] font-semibold uppercase tracking-[.18em] text-cream"
        >
          M&apos;inscrire →
        </button>
      </form>
    </Reveal>
  );
}
