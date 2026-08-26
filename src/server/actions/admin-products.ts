"use server";

import { productFormSchema, reorderSchema } from "@/lib/validation/product";
import { formAction, action } from "../action";
import { db } from "../db";
import { invalidateCatalog } from "../catalog";
import { guardAdminAction, PROVISIONAL_ACTOR_ID } from "../admin-guard";
import { reorderProducts, upsertProduct } from "../services/catalog";
import { ActionError } from "../errors";

/**
 * Écritures du catalogue depuis l'administration (HEP-39).
 *
 * Chaque action commence par `guardAdminAction()` : une Server Action est un
 * point d'entrée réseau appelable directement, la garde posée sur la page ne
 * la protège pas.
 *
 * Chaque écriture invalide le cache catalogue, ce qui rend le changement
 * visible sur le site sans redéploiement — la definition of done de HEP-45.
 */

export const saveProduct = formAction(
  productFormSchema,
  async (input) => {
    guardAdminAction();

    // Le slug est l'URL publique du produit : le changer casse les liens
    // existants et les positions acquises en référencement. On l'autorise à
    // la création, on le fige ensuite.
    if (input.id) {
      const current = await db.product.findUnique({
        where: { id: input.id },
        select: { slug: true },
      });
      if (current && current.slug !== input.slug) {
        throw new ActionError(
          "VALIDATION",
          "L'identifiant d'URL ne peut plus être modifié : les liens et le référencement en dépendent.",
          { slug: "Modification impossible après création." },
        );
      }
    }

    const { id, ...data } = input;
    void id;

    const result = await upsertProduct(db, data, PROVISIONAL_ACTOR_ID);

    invalidateCatalog(input.slug);

    return { id: result.id, slug: input.slug, created: result.created };
  },
  { name: "admin.product.save" },
);

export const reorder = action(
  reorderSchema,
  async ({ slugs }) => {
    guardAdminAction();
    await reorderProducts(db, slugs, PROVISIONAL_ACTOR_ID);
    invalidateCatalog();
    return { count: slugs.length };
  },
  { name: "admin.product.reorder" },
);
