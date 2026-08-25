import { z } from "zod";
import {
  ActionError,
  DEFAULT_MESSAGES,
  type ActionResult,
  type ErrorCode,
} from "./errors";

/**
 * Enveloppe unique des Server Actions (HEP-34).
 *
 *   parse Zod → rate limit → exécution → capture Sentry
 *
 * Tout passe par ici. Une action qui valide « à la main » finira tôt ou tard
 * par accepter une entrée non vérifiée : la validation côté client n'est
 * qu'un confort d'affichage, elle ne protège rien.
 *
 * Convention arrêtée pour tout le projet :
 *   - **Server Action** pour toute mutation déclenchée par un formulaire ;
 *   - **Route Handler** pour ce qui vient de l'extérieur — webhooks Stripe et
 *     Sendcloud, liens de confirmation, crons.
 */

export type ActionContext = {
  /** Nom de l'action, utilisé pour la clé de rate limit et les traces. */
  name: string;
};

type RateLimitRule = {
  /** Nombre d'exécutions autorisées par `windowSeconds`. */
  limit: number;
  windowSeconds: number;
  /** Clé d'isolement : IP, email, identifiant de panier… */
  by: "ip" | "session";
};

type ActionOptions = {
  name: string;
  rateLimit?: RateLimitRule;
};

/**
 * Point d'ancrage du rate limiting. Upstash n'est pas encore provisionné
 * (HEP-35) : tant qu'il ne l'est pas, cette fonction laisse passer. Elle
 * existe déjà pour que brancher Upstash soit un changement d'un seul fichier
 * et non une reprise de toutes les actions.
 */
async function checkRateLimit(
  _ctx: ActionContext,
  rule: RateLimitRule | undefined,
): Promise<boolean> {
  if (!rule) return true;
  // TODO(HEP-35) : @upstash/ratelimit, clé `${ctx.name}:${identifier}`.
  return true;
}

/**
 * Point d'ancrage de la capture d'erreur. Sentry arrive en HEP-38 ; en
 * attendant, on écrit sur la sortie d'erreur pour ne rien perdre en local.
 */
function captureException(error: unknown, ctx: ActionContext): void {
  // TODO(HEP-38) : Sentry.captureException(error, { tags: { action: ctx.name } })
  console.error(`[action:${ctx.name}]`, error);
}

/** Aplatit les erreurs Zod en `{ champ: message }` pour l'affichage. */
function toFieldErrors(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const path = issue.path.join(".") || "_form";
    // Première erreur seulement : afficher trois messages sous un champ ne
    // fait qu'embrouiller la personne qui remplit le formulaire.
    fields[path] ??= issue.message;
  }
  return fields;
}

/**
 * Construit une Server Action typée à partir d'un schéma et d'un handler.
 *
 * Le handler ne reçoit que des données déjà validées : il n'a jamais à se
 * demander si `input.email` est bien une adresse.
 */
export function action<S extends z.ZodType, T>(
  schema: S,
  handler: (input: z.output<S>, ctx: ActionContext) => Promise<T>,
  options: ActionOptions,
) {
  const ctx: ActionContext = { name: options.name };

  return async function run(raw: unknown): Promise<ActionResult<T>> {
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      return {
        ok: false,
        code: "VALIDATION",
        message: DEFAULT_MESSAGES.VALIDATION,
        fields: toFieldErrors(parsed.error),
      };
    }

    if (!(await checkRateLimit(ctx, options.rateLimit))) {
      return { ok: false, code: "RATE_LIMITED", message: DEFAULT_MESSAGES.RATE_LIMITED };
    }

    try {
      return { ok: true, data: await handler(parsed.data, ctx) };
    } catch (error) {
      // Erreur métier prévue : elle est faite pour être montrée.
      if (error instanceof ActionError) {
        return {
          ok: false,
          code: error.code,
          message: error.message,
          fields: error.fields,
        };
      }

      // Tout le reste est un bug. Le détail part chez Sentry ; le client ne
      // reçoit qu'un message générique — un message d'erreur brut renseigne
      // autant l'utilisateur qu'un attaquant.
      captureException(error, ctx);
      const code: ErrorCode = "INTERNAL";
      return { ok: false, code, message: DEFAULT_MESSAGES[code] };
    }
  };
}

/**
 * Variante pour les formulaires HTML natifs, qui envoient un `FormData`.
 * Les cases à cocher absentes valent `false` plutôt que `undefined`, sinon
 * une case décochée déclenche une erreur « champ requis » incompréhensible.
 */
export function formAction<S extends z.ZodType, T>(
  schema: S,
  handler: (input: z.output<S>, ctx: ActionContext) => Promise<T>,
  options: ActionOptions & { booleans?: readonly string[] },
) {
  const run = action(schema, handler, options);

  return async function runForm(formData: FormData): Promise<ActionResult<T>> {
    const raw: Record<string, unknown> = Object.fromEntries(formData.entries());
    for (const key of options.booleans ?? []) {
      raw[key] = formData.get(key) === "on" || formData.get(key) === "true";
    }
    return run(raw);
  };
}
