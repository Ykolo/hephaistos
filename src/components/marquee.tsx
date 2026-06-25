const ITEMS = [
  "Fabriqué en France",
  "Formules clean",
  "Sans superflu",
  "Pensé pour la peau masculine",
];

export function Marquee() {
  // duplicated content so the -50% translate loops seamlessly
  const sequence = [...ITEMS, ...ITEMS];
  return (
    <div className="overflow-hidden whitespace-nowrap bg-ink py-4 text-cream">
      <div className="inline-flex animate-marquee gap-12 font-serif text-[18px] italic text-dust">
        {sequence.map((item, i) => (
          <span key={i} className="flex items-center gap-12">
            {item}
            <span className="opacity-40">✦</span>
          </span>
        ))}
      </div>
    </div>
  );
}
