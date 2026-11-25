"use server";

import { cookies, headers } from "next/headers";
import { z } from "zod";
import { action } from "../action";
import { RATE_LIMITS } from "../ratelimit";
import { db } from "../db";
import { currentIpHash } from "../ip";
import { recordConsent } from "../services/consent";
import { CONSENT_COOKIE, CONSENT_MAX_AGE_SECONDS, encodeConsent, type ConsentState } from "@/lib/consent";

/**
 * Enregistre un choix de la bannière cookies (HEP-93) : la preuve en base,
 * puis le cookie `hf_consent`.
 *
 * Le cookie n'est pas `httpOnly` : les chargeurs de GA4 et du pixel Meta
 * (HEP-94, HEP-95) doivent pouvoir le lire avant de charger quoi que ce
 * soit. Il ne contient qu'un identifiant de preuve et deux booléens.
 */
export const saveConsent = action(
  z.object({
    action: z.enum(["accept_all", "reject_all", "custom", "dismiss"]),
    analytics: z.boolean().default(false),
    marketing: z.boolean().default(false),
  }),
  async (input): Promise<ConsentState> => {
    const store = await cookies();
    const state = await recordConsent(db, {
      previousCookie: store.get(CONSENT_COOKIE)?.value ?? null,
      action: input.action,
      choice: { analytics: input.analytics, marketing: input.marketing },
      ipHash: await currentIpHash(),
      userAgent: (await headers()).get("user-agent"),
    });

    store.set(CONSENT_COOKIE, encodeConsent(state), {
      httpOnly: false,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: CONSENT_MAX_AGE_SECONDS,
    });

    return {
      consentId: state.consentId,
      version: state.version,
      analytics: state.analytics,
      marketing: state.marketing,
    };
  },
  { name: "consent.save", rateLimit: RATE_LIMITS.consent },
);
