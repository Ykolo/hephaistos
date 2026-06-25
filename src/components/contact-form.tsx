"use client";

import { useState } from "react";

const inputCls =
  "w-full border-0 border-b border-line-strong bg-transparent py-[11px] text-[15px] outline-none focus:border-ink";

const labelCls =
  "mb-2 block text-[11px] uppercase tracking-[.14em] text-muted-ink";

export function ContactForm() {
  const [sent, setSent] = useState(false);

  if (sent) {
    return (
      <div className="flex h-full flex-col justify-center bg-sand px-9 py-12 text-center">
        <div className="mb-[14px] font-serif text-[1.8rem]">
          Message envoyé.
        </div>
        <p className="m-0 text-[14px] leading-[1.7] text-body">
          Merci — on revient vers toi très vite.
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setSent(true);
      }}
      className="flex flex-col gap-[18px]"
    >
      <div className="grid grid-cols-2 gap-[18px]">
        <div>
          <label className={labelCls}>Prénom</label>
          <input type="text" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Nom</label>
          <input type="text" className={inputCls} />
        </div>
      </div>
      <div>
        <label className={labelCls}>Email</label>
        <input type="email" required className={inputCls} />
      </div>
      <div>
        <label className={labelCls}>Sujet</label>
        <input type="text" className={inputCls} />
      </div>
      <div>
        <label className={labelCls}>Message</label>
        <textarea rows={4} className={`${inputCls} resize-y`} />
      </div>
      <button
        type="submit"
        className="mt-3 cursor-pointer self-start border border-ink bg-ink px-11 py-[17px] text-[11.5px] font-semibold uppercase tracking-[.18em] text-white transition-colors hover:bg-paper hover:text-ink"
      >
        Envoyer
      </button>
    </form>
  );
}
