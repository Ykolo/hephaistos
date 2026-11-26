import { ImageResponse } from "next/og";
import { SITE_NAME, SITE_TAGLINE } from "@/lib/metadata";

/**
 * Image de partage de repli (HEP-98), pour toutes les pages qui n'en ont pas
 * de propre — les fiches produit, elles, partagent leur photo principale.
 *
 * Générée au build, aux dimensions qu'attendent Facebook, LinkedIn et
 * WhatsApp : en dessous de 1200 × 630, l'aperçu tombe en vignette.
 */

export const alt = `${SITE_NAME} — ${SITE_TAGLINE}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
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
        <div style={{ fontSize: 30, letterSpacing: 12, color: "#9a958c", marginBottom: 36 }}>
          SOINS VISAGE — HOMME
        </div>
        <div style={{ fontSize: 120, letterSpacing: 24, lineHeight: 1 }}>HÉPHAÏSTOS</div>
        <div style={{ fontSize: 44, fontStyle: "italic", color: "#d8d2c6", marginTop: 40 }}>
          {SITE_TAGLINE}
        </div>
      </div>
    ),
    size,
  );
}
