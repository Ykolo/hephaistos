import { RecallSearch } from "@/components/admin/recall-search";

/**
 * Écran de rappel produit (HEP-44).
 *
 * Entièrement piloté par la recherche : rien à charger tant qu'aucun lot
 * n'est saisi, donc pas de lecture serveur au rendu.
 */
export default function RecallPage() {
  return (
    <div>
      <h1 className="m-0 mb-2 font-serif text-[1.8rem] font-normal">
        Rappel produit
      </h1>
      <p className="m-0 mb-8 max-w-[70ch] text-[12.5px] leading-[1.6] text-muted-ink">
        Saisissez le numéro du lot rappelé pour obtenir la liste des clients à
        prévenir. Les commandes du même produit <strong>sans lot renseigné</strong>{" "}
        sont listées séparément : faute d&apos;information, elles doivent être
        traitées comme potentiellement concernées.
      </p>

      <RecallSearch />
    </div>
  );
}
