import { promises as fs } from "node:fs";
import path from "node:path";

/**
 * Abstraction de stockage de fichiers (HEP-43).
 *
 * Les photos produit sont la partie la **moins** spécifique à l'hébergeur de
 * toute la stack. Les enfermer derrière un SDK n'apporterait rien : cette
 * interface fait tenir le changement de fournisseur — Vercel Blob, Cloudflare
 * R2, S3 — dans un seul fichier.
 *
 * Le pilote local sert au développement et aux tests : la suite ne doit pas
 * dépendre d'un service distant pour vérifier qu'un WebP est bien produit.
 */

export type StoredFile = {
  /** URL publique du fichier. */
  url: string;
  /** Chemin interne, utilisé pour la suppression. */
  pathname: string;
};

export interface Storage {
  put(
    pathname: string,
    body: Buffer,
    contentType: string,
  ): Promise<StoredFile>;
  /** Supprime par URL. Ne doit pas échouer si le fichier a déjà disparu. */
  delete(url: string): Promise<void>;
}

/** Vercel Blob — preview et production. */
function blobStorage(token: string): Storage {
  return {
    async put(pathname, body, contentType) {
      const { put } = await import("@vercel/blob");
      const result = await put(pathname, body, {
        access: "public",
        contentType,
        token,
        // Le nom est déjà unique et généré par nos soins : laisser Vercel y
        // ajouter un suffixe aléatoire rendrait l'URL imprévisible et
        // compliquerait le nettoyage.
        addRandomSuffix: false,
      });
      return { url: result.url, pathname: result.pathname };
    },
    async delete(url) {
      const { del } = await import("@vercel/blob");
      // Une suppression doit être idempotente : si le fichier n'existe plus,
      // c'est le résultat voulu, pas une erreur.
      await del(url, { token }).catch(() => undefined);
    },
  };
}

/**
 * Système de fichiers local — développement et tests.
 *
 * Écrit dans `public/uploads`, servi directement par Next à `/uploads/...`.
 */
function localStorage(): Storage {
  const root = path.join(process.cwd(), "public", "uploads");

  return {
    async put(pathname, body) {
      const target = path.join(root, pathname);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, body);
      return { url: `/uploads/${pathname}`, pathname };
    },
    async delete(url) {
      if (!url.startsWith("/uploads/")) return;
      const target = path.join(root, url.slice("/uploads/".length));
      // `force` : pas d'erreur si le fichier est déjà absent.
      await fs.rm(target, { force: true });
    },
  };
}

/**
 * Pilote actif.
 *
 * Bascule sur le stockage distant dès qu'un token est présent — donc
 * automatiquement en preview et en production, et en local pour qui a fait
 * `vercel env pull`. Sinon, disque local.
 */
export function getStorage(): Storage {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  return token ? blobStorage(token) : localStorage();
}

/** Nom du pilote actif — affiché en admin pour lever toute ambiguïté. */
export function storageDriver(): "blob" | "local" {
  return process.env.BLOB_READ_WRITE_TOKEN ? "blob" : "local";
}
