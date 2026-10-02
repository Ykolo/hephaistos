/**
 * Adresse figée d'une commande (HEP-52), lue depuis le JSON stocké.
 *
 * Lecture prudente, champ par champ : l'adresse a été validée à l'écriture,
 * mais un JSON reste un JSON — une reprise de données ou un ancien format ne
 * doit pas faire planter la fiche le jour où un client appelle.
 */

type Json = unknown;

function fields(value: Json): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string" && entry[1] !== "",
    ),
  );
}

/** Vrai si les deux adresses portent exactement les mêmes champs. */
export function sameAddress(a: Json, b: Json): boolean {
  const fa = fields(a);
  const fb = fields(b);
  const keys = new Set([...Object.keys(fa), ...Object.keys(fb)]);
  return [...keys].every((k) => fa[k] === fb[k]);
}

export function AddressBlock({ value }: { value: Json }) {
  const a = fields(value);
  if (Object.keys(a).length === 0) {
    return <p className="m-0 text-[13px] text-muted-ink">Adresse absente.</p>;
  }
  return (
    <address className="text-[13.5px] not-italic leading-[1.7]">
      {[a.firstName, a.lastName].filter(Boolean).join(" ")}
      {a.company && (
        <>
          <br />
          {a.company}
        </>
      )}
      <br />
      {a.line1}
      {a.line2 && (
        <>
          <br />
          {a.line2}
        </>
      )}
      <br />
      {a.postalCode} {a.city}
      {a.country && a.country !== "FR" && (
        <>
          <br />
          {a.country}
        </>
      )}
      {a.phone && (
        <>
          <br />
          {a.phone}
        </>
      )}
    </address>
  );
}
