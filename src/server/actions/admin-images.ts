"use server";

import { z } from "zod";
import { action } from "../action";
import { db } from "../db";
import { invalidateCatalog } from "../catalog";
import { guardAdminAction } from "../admin-guard";
import { ActionError } from "../errors";
import {
  attachImage,
  detachImage,
  reorderImages,
  MAX_UPLOAD_BYTES,
} from "../services/images";

/**
 * Gestion des images produit en administration (HEP-43).
 *
 * L'envoi passe par un `FormData` brut plutôt que par un schéma Zod : un
 * fichier n'est pas une valeur sérialisable, et le seul contrôle qui compte —
 * le type réel lu dans les premiers octets — se fait dans le service.
 */
export async function uploadProductImage(
  formData: FormData,
): Promise<
  | { ok: true; data: { url: string; count: number } }
  | { ok: false; code: string; message: string; fields?: Record<string, string> }
> {
  try {
    guardAdminAction();

    const file = formData.get("file");
    const slug = String(formData.get("productSlug") ?? "");
    const alt = String(formData.get("alt") ?? "");
    const role = String(formData.get("role") ?? "GALLERY");

    if (!(file instanceof File) || file.size === 0) {
      throw new ActionError("VALIDATION", "Aucun fichier sélectionné.");
    }
    // Contrôle de taille avant de charger en mémoire : inutile de lire
    // 500 Mo pour découvrir ensuite qu'ils sont refusés.
    if (file.size > MAX_UPLOAD_BYTES) {
      throw new ActionError(
        "VALIDATION",
        `L'image dépasse ${MAX_UPLOAD_BYTES / 1024 / 1024} Mo.`,
      );
    }
    if (!["PRIMARY", "HOVER", "GALLERY"].includes(role)) {
      throw new ActionError("VALIDATION", "Rôle d'image invalide.");
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await attachImage(db, {
      productSlug: slug,
      buffer,
      alt,
      role: role as "PRIMARY" | "HOVER" | "GALLERY",
    });

    invalidateCatalog(slug);
    return { ok: true, data: result };
  } catch (error) {
    if (error instanceof ActionError) {
      return {
        ok: false,
        code: error.code,
        message: error.message,
        fields: error.fields,
      };
    }
    console.error("[admin.image.upload]", error);
    return {
      ok: false,
      code: "INTERNAL",
      message: "L'envoi de l'image a échoué.",
    };
  }
}

export const removeProductImage = action(
  z.object({ imageId: z.string().min(1), productSlug: z.string().min(1) }),
  async ({ imageId, productSlug }) => {
    guardAdminAction();
    await detachImage(db, imageId);
    invalidateCatalog(productSlug);
    return { removed: true };
  },
  { name: "admin.image.remove" },
);

export const reorderProductImages = action(
  z.object({
    productSlug: z.string().min(1),
    imageIds: z.array(z.string().min(1)).min(1),
  }),
  async ({ productSlug, imageIds }) => {
    guardAdminAction();
    await reorderImages(db, productSlug, imageIds);
    invalidateCatalog(productSlug);
    return { count: imageIds.length };
  },
  { name: "admin.image.reorder" },
);
