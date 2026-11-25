import { getCompanySettings } from "@/server/company";
import { footerLine } from "@/lib/company";

/**
 * Ligne société du pied de page (HEP-80), rendue côté serveur et passée au
 * chrome comme un simple nœud — même raison que `SearchOverlayData` : le
 * layout racine ne doit rien attendre.
 */
export async function FooterCompany() {
  const company = await getCompanySettings();
  return <span>{footerLine(company)}</span>;
}
