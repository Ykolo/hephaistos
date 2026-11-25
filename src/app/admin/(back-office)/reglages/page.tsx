import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { db } from "@/server/db";
import { readCompanySettings } from "@/server/services/company";
import { CompanyForm } from "@/components/admin/company-form";
import { missingLegalFields } from "@/lib/company";
import { adminRoutes } from "@/lib/routes";

/**
 * Réglages entreprise (HEP-80) : une seule source pour les informations de la
 * société, reprises par les mentions légales, les CGV, le pied de page et les
 * factures.
 */
export default function CompanySettingsPage() {
  return (
    <div>
      <h1 className="m-0 mb-2 font-serif text-[1.8rem] font-normal">Réglages</h1>
      <p className="m-0 mb-8 max-w-[70ch] text-[12.5px] leading-[1.6] text-muted-ink">
        Ces informations alimentent les{" "}
        <Link href="/legal" className="underline underline-offset-4">
          mentions légales
        </Link>
        , les CGV et le pied de page, aussitôt enregistrées. Un champ vide s&apos;affiche « à
        compléter » sur le site : rien n&apos;est jamais inventé.
      </p>
      <Suspense fallback={<p className="text-[13px] text-muted-ink">Chargement…</p>}>
        <CompanyContent />
      </Suspense>
    </div>
  );
}

async function CompanyContent() {
  await connection();
  const settings = await readCompanySettings(db);
  const missing = missingLegalFields(settings);

  return (
    <>
      {missing.length > 0 && (
        <div role="status" className="mb-8 border border-red-700/30 bg-red-50 p-4 text-[13px] leading-[1.6] text-red-700">
          <strong>Mentions légales incomplètes.</strong> Il manque : {missing.join(", ")}. Un site marchand
          aux mentions incomplètes s&apos;expose à une amende ; à compléter avant la mise en ligne.
        </div>
      )}
      <CompanyForm initial={settings} />
      <p className="mt-6 text-[11.5px] text-muted-ink">
        Chaque modification est inscrite au{" "}
        <Link href={`${adminRoutes.auditLog}?entite=CompanySettings`} className="underline underline-offset-4">
          journal
        </Link>
        , avec l&apos;ancienne et la nouvelle valeur.
      </p>
    </>
  );
}
