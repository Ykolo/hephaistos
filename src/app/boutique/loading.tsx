/**
 * Écran d'attente de la collection.
 *
 * Volontairement sobre : le catalogue est mis en cache et rendu côté serveur,
 * donc cet écran ne doit quasiment jamais apparaître. Il n'existe que pour le
 * premier rendu après invalidation. Un squelette animé signalerait une lenteur
 * là où il n'y en a pas, et produirait un décalage visuel au remplacement —
 * c'est précisément le point de vigilance de HEP-45.
 */
export default function Loading() {
  return (
    <div className="mx-auto max-w-[1320px] px-6 pb-[clamp(80px,12vw,150px)] pt-[clamp(60px,9vw,120px)] text-center sm:px-14">
      <p className="m-0 font-serif text-[1.15rem] italic text-muted-ink">
        Chargement de la collection…
      </p>
    </div>
  );
}
