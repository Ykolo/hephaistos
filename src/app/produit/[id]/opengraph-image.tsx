import { ImageResponse } from "next/og";
import { cacheLife, cacheTag } from "next/cache";
import { catalogTags, getProductBySlug, getProductSlugs } from "@/server/catalog";
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
 *
 * La conversion vit dans une fonction `"use cache"` : avec `cacheComponents`,
 * un `fetch` non mis en cache pendant le prérendu interrompt le rendu — et
 * le `try` l'aurait pris pour une erreur, figeant le repli texte au build.
 */

export const size = { width: 1200, height: 630 };
// Pas de `contentType` déclaré : JPEG en temps normal, PNG en repli.
export const alt = `Photo du produit — ${SITE_NAME}`;

export async function generateStaticParams() {
  const slugs = await getProductSlugs();
  return slugs.map((id) => ({ id }));
}

/**
 * La photo, convertie, en base64 pour que le cache la sérialise. Étiquetée
 * `products` : une photo changée dans l'admin régénère l'aperçu.
 *
 * Elle **lève** en cas d'échec au lieu de renvoyer `null` : une erreur n'est
 * jamais mise en cache, alors qu'un `null` figerait le repli des jours durant
 * après une simple indisponibilité passagère du stockage.
 */
async function shareJpeg(imageUrl: string): Promise<string> {
  "use cache";
  cacheTag(catalogTags.all);
  cacheLife("days");
  const [{ default: sharp }, source] = await Promise.all([import("sharp"), fetch(imageUrl)]);
  if (!source.ok) throw new Error(`photo injoignable (HTTP ${source.status})`);
  const jpeg = await sharp(Buffer.from(await source.arrayBuffer()))
    // Fond clair : les photos détourées ont de la transparence, qu'un JPEG
    // rendrait en noir.
    .flatten({ background: "#f5f5f4" })
    .resize(size.width, size.height, { fit: "contain", background: "#f5f5f4" })
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer();
  return jpeg.toString("base64");
}

export default async function ProductShareImage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const product = await getProductBySlug(id);

  let jpeg: string | null = null;
  if (product?.image) {
    try {
      jpeg = await shareJpeg(product.image);
    } catch (error) {
      console.error("[og] conversion de la photo impossible", error);
    }
  }
  if (jpeg) {
    return new Response(new Uint8Array(Buffer.from(jpeg, "base64")), {
      headers: { "Content-Type": "image/jpeg" },
    });
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
