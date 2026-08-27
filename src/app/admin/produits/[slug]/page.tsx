import { Suspense } from "react";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/server/db";
import {
  findProductForEdit,
  getBundleComposition,
} from "@/server/services/catalog";
import { ProductForm } from "@/components/admin/product-form";
import { BundleComposition } from "@/components/admin/bundle-composition";
import { getAdminProductSlugs } from "@/server/catalog";

/**
 * Les slugs sont connus à la construction — brouillons compris.
 *
 * Sans cela, `cacheComponents` doit produire une coquille pour un paramètre
 * inconnu, et refuse de construire dès qu'un ancêtre lit la moindre donnée.
 * C'est le même choix que sur `/produit/[id]`.
 */
export async function generateStaticParams() {
  const slugs = await getAdminProductSlugs();
  return slugs.map((slug) => ({ slug }));
}

/** Centimes → euros pour la saisie ; chaîne vide si absent. */
function toEuros(cents: number | null): string {
  return cents === null ? "" : (cents / 100).toString().replace(".", ",");
}

/**
 * La coquille est statique, la fiche arrive en flux.
 *
 * `params` est **volontairement** transmis sans être attendu : c'est une
 * donnée de requête au même titre que la lecture en base. L'attendre ici
 * rendrait la page bloquante et remonterait jusqu'au layout racine —
 * `cacheComponents` refuse alors de construire, avec une erreur qui désigne
 * le chrome du site plutôt que la vraie cause.
 */
export default function EditProductPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  return (
    <div>
      <Link
        href="/admin/produits"
        className="mb-5 inline-block text-[12px] text-muted-ink underline underline-offset-4"
      >
        ← Tous les produits
      </Link>

      <Suspense
        fallback={
          <p className="text-[13px] text-muted-ink">Chargement de la fiche…</p>
        }
      >
        <EditForm params={params} />
      </Suspense>
    </div>
  );
}

async function EditForm({ params }: { params: Promise<{ slug: string }> }) {
  await connection();
  const { slug } = await params;
  const product = await findProductForEdit(db, slug);
  if (!product) notFound();

  // Chargé seulement pour un coffret : inutile de lister les candidats pour
  // un produit simple.
  const isBundle = product.kind === "BUNDLE";
  const [composition, candidates] = isBundle
    ? await Promise.all([
        getBundleComposition(db, slug),
        // Uniquement des produits simples : les coffrets imbriqués sont
        // refusés côté serveur, autant ne pas les proposer.
        db.product.findMany({
          where: { kind: "SIMPLE" },
          orderBy: { name: "asc" },
          select: { slug: true, name: true, sku: true, stock: true },
        }),
      ])
    : [[], []];

  return (
    <>
      <h1 className="m-0 mb-6 font-serif text-[1.8rem] font-normal">
        {product.name}
      </h1>

      <ProductForm
        initial={{
          id: product.id,
          slug: product.slug,
          sku: product.sku,
          name: product.name,
          tagline: product.tagline ?? "",
          description: product.description,
          category: product.category,
          kind: product.kind,
          status: product.status,
          availability: product.availability,
          priceEuros: toEuros(product.priceCents),
          compareAtEuros: toEuros(product.compareAtCents),
          volumeMl: product.volumeMl?.toString() ?? "",
          weightGrams: product.weightGrams.toString(),
          // `<input type="date">` attend AAAA-MM-JJ.
          preorderShipsAt:
            product.preorderShipsAt?.toISOString().slice(0, 10) ?? "",
          usage: product.usage ?? "",
          inci: product.inci ?? "",
          precautions: product.precautions ?? "",
          seoTitle: product.seoTitle ?? "",
          seoDescription: product.seoDescription ?? "",
        }}
      />

      {isBundle && (
        <BundleComposition
          bundleSlug={product.slug}
          candidates={candidates}
          initial={composition.map((c) => ({ slug: c.component.slug, qty: c.qty }))}
        />
      )}
    </>
  );
}
