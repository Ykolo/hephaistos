import { ImageResponse } from "next/og";
import { getProductBySlug, getProductSlugs } from "@/server/catalog";
import { SITE_NAME } from "@/lib/metadata";

/**
 * Image de partage d'une fiche produit (HEP-98) : la photo principale,
 * recadrée en 1200 × 630 et convertie en **JPEG**.
 *
 * Les photos sont stockées en WebP (HEP-43), que LinkedIn n'affiche pas dans
 * ses aperçus et que certains clients de messagerie gèrent mal. Le JPEG passe
 * partout.
 *
 * `sharp` est importé à la demande et sous `try` : son binaire natif peut
 * manquer (poste Windows, par exemple), et un import en tête de fichier ferait
 * tomber tout le serveur. L'aperçu retombe alors sur un visuel texte.
 */

export const size = { width: 1200, height: 630 };
// Pas de `contentType` déclaré : JPEG en temps normal, PNG en repli.
export const alt = `Photo du produit — ${SITE_NAME}`;

export async function generateStaticParams() {
  const slugs = await getProductSlugs();
  return slugs.map((id) => ({ id }));
}

export default async function ProductShareImage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const product = await getProductBySlug(id);

  if (product?.image) {
    try {
      const [{ default: sharp }, source] = await Promise.all([import("sharp"), fetch(product.image)]);
      if (source.ok) {
        const jpeg = await sharp(Buffer.from(await source.arrayBuffer()))
          // Fond clair : les photos détourées ont de la transparence, qu'un
          // JPEG rendrait en noir.
          .flatten({ background: "#f5f5f4" })
          .resize(size.width, size.height, { fit: "contain", background: "#f5f5f4" })
          .jpeg({ quality: 82, mozjpeg: true })
          .toBuffer();
        return new Response(new Uint8Array(jpeg), { headers: { "Content-Type": "image/jpeg" } });
      }
    } catch {
      // Photo injoignable ou `sharp` indisponible : on retombe sur le visuel
      // texte ci-dessous plutôt que de casser l'aperçu.
    }
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#141414",
          color: "#f3efe7",
        }}
      >
        <div style={{ fontSize: 30, letterSpacing: 12, color: "#9a958c", marginBottom: 32 }}>HÉPHAÏSTOS</div>
        <div style={{ fontSize: 72 }}>{product?.name ?? SITE_NAME}</div>
      </div>
    ),
    { ...size },
  );
}
