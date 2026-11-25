"use client";

import { useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";
import Link from "next/link";
import { saveConsent } from "@/server/actions/consent";
import { useUIStore } from "@/store/ui-store";
import {
  CONSENT_CATEGORIES,
  CONSENT_EVENT,
  readConsentFromDocument,
  type ConsentAction,
  type ConsentChoice,
} from "@/lib/consent";

/**
 * Bannière cookies (HEP-93), conforme aux lignes directrices de la CNIL :
 *
 * - **trois boutons au même niveau visuel** — mêmes classes, même taille :
 *   refuser est aussi simple qu'accepter, en un clic, dès le premier écran ;
 * - **elle ne bloque pas le site** : pas de voile, pas de piège du focus. Un
 *   consentement forcé n'est pas un consentement ;
 * - la croix « Continuer sans accepter » enregistre un **refus** ;
 * - rien n'est déposé avant un clic : la bannière ne charge aucun script, et
 *   le cookie \`hf_consent\` n'est posé qu'en réponse au choix.
 */

const button =
  "w-full cursor-pointer border border-ink bg-ink px-4 py-3 text-[11px] font-semibold uppercase tracking-[.14em] text-white transition-colors hover:bg-paper hover:text-ink disabled:opacity-60 sm:flex-1";

/** Abonnement au cookie : relu quand la bannière vient d'enregistrer un choix. */
function subscribe(onChange: () => void) {
  window.addEventListener(CONSENT_EVENT, onChange);
  return () => window.removeEventListener(CONSENT_EVENT, onChange);
}

export function CookieBanner() {
  const consentOpen = useUIStore((s) => s.consentOpen);
  const closeConsent = useUIStore((s) => s.closeConsent);
  // Côté serveur, `undefined` : rien n'est rendu, pour ne pas afficher la
  // bannière une fraction de seconde à quelqu'un qui a déjà choisi.
  const stored = useSyncExternalStore(
    subscribe,
    () => {
      const c = readConsentFromDocument();
      return c ? `${c.analytics ? 1 : 0}${c.marketing ? 1 : 0}` : "";
    },
    () => undefined,
  );
  const firstVisit = stored === undefined ? null : stored === "";
  const [expanded, setExpanded] = useState(false);
  const [edited, setEdited] = useState<ConsentChoice | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const panel = useRef<HTMLDivElement>(null);

  // Rouverte depuis le pied de page : directement sur le détail, avec le
  // choix en cours.
  const customizing = expanded || consentOpen;
  const choice: ConsentChoice = edited ?? {
    analytics: stored?.[0] === "1",
    marketing: stored?.[1] === "1",
  };
  const setChoice = (update: (v: ConsentChoice) => ConsentChoice) => setEdited(update(choice));

  // Le focus suit l'ouverture, pour le clavier. Aucun état modifié ici.
  useEffect(() => {
    if (consentOpen) panel.current?.focus();
  }, [consentOpen]);

  const visible = firstVisit === true || consentOpen;
  if (!visible) return null;

  function close() {
    setExpanded(false);
    setEdited(null);
    closeConsent();
  }

  function submit(action: ConsentAction, custom: ConsentChoice = choice) {
    startTransition(async () => {
      const result = await saveConsent({ action, ...custom });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setError(null);
      close();
      // Les futurs chargeurs GA4 / Meta écoutent cet événement ; la bannière
      // aussi, pour relire le cookie qui vient d'être posé.
      window.dispatchEvent(new CustomEvent(CONSENT_EVENT, { detail: result.data }));
    });
  }

  function dismiss() {
    // Rouverte pour consultation, un choix existe déjà : on ferme sans rien
    // changer. Premier passage : fermer vaut refus, et ce refus est prouvé.
    if (!firstVisit) {
      close();
      return;
    }
    submit("dismiss", { analytics: false, marketing: false });
  }

  return (
    <div
      ref={panel}
      role="dialog"
      aria-modal="false"
      aria-labelledby="cookie-title"
      tabIndex={-1}
      onKeyDown={(e) => {
        if (e.key === "Escape") dismiss();
      }}
      className="fixed inset-x-3 bottom-3 z-[60] max-h-[85vh] overflow-y-auto border border-line-strong bg-paper p-5 text-ink shadow-[0_8px_40px_rgba(0,0,0,.12)] outline-none sm:inset-x-auto sm:left-6 sm:bottom-6 sm:max-w-[560px] sm:p-6 print:hidden"
    >
      <button
        type="button"
        onClick={dismiss}
        disabled={pending}
        className="absolute right-3 top-3 cursor-pointer bg-transparent text-[11.5px] text-muted-ink underline underline-offset-4"
      >
        {firstVisit ? "Continuer sans accepter" : "Fermer"}
      </button>

      <h2 id="cookie-title" className="m-0 mb-3 mt-4 font-serif text-[1.25rem] font-normal sm:mt-0">
        Vos cookies, votre choix
      </h2>
      <p className="m-0 mb-4 text-[13px] leading-[1.6] text-body">
        Nous utilisons des cookies nécessaires au panier et à votre compte. Avec votre accord,
        d&apos;autres servent à mesurer l&apos;audience et l&apos;efficacité de nos publicités. Refuser
        ne change rien à votre commande. Vous pouvez changer d&apos;avis à tout moment depuis « Gérer
        mes cookies », en bas de chaque page.{" "}
        <Link href="/legal?tab=cookies" className="underline underline-offset-4">
          En savoir plus
        </Link>
      </p>

      {customizing && (
        <fieldset className="m-0 mb-4 border-0 p-0">
          <legend className="sr-only">Catégories de cookies</legend>
          <div className="flex flex-col gap-3">
            {CONSENT_CATEGORIES.map((c) => {
              const necessary = c.key === "necessary";
              const checked = necessary ? true : choice[c.key as keyof ConsentChoice];
              return (
                <label key={c.key} className="flex items-start gap-3 border border-line px-3 py-2.5">
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={necessary}
                    onChange={(e) =>
                      !necessary && setChoice((v) => ({ ...v, [c.key]: e.target.checked }))
                    }
                    className="mt-[3px] accent-ink"
                  />
                  <span>
                    <span className="block text-[13px] font-medium">
                      {c.label}
                      {necessary && <span className="font-normal text-muted-ink"> — toujours actifs</span>}
                    </span>
                    <span className="block text-[12px] leading-[1.5] text-muted-ink">{c.description}</span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
      )}

      {error && (
        <p role="alert" className="m-0 mb-3 text-[12px] text-red-700">
          {error}
        </p>
      )}

      {/* Empilés sur mobile, alignés au-delà : toujours trois boutons de même taille. */}
      <div className="flex flex-col gap-2 sm:flex-row">
        <button type="button" disabled={pending} onClick={() => submit("reject_all")} className={button}>
          Tout refuser
        </button>
        {customizing ? (
          <button type="button" disabled={pending} onClick={() => submit("custom")} className={button}>
            Enregistrer
          </button>
        ) : (
          <button type="button" disabled={pending} onClick={() => setExpanded(true)} className={button}>
            Personnaliser
          </button>
        )}
        <button type="button" disabled={pending} onClick={() => submit("accept_all")} className={button}>
          Tout accepter
        </button>
      </div>
    </div>
  );
}

/** Lien permanent du pied de page. */
export function ManageCookiesButton({ className }: { className?: string }) {
  const openConsent = useUIStore((s) => s.openConsent);
  return (
    <button type="button" onClick={openConsent} className={className}>
      Gérer mes cookies
    </button>
  );
}
