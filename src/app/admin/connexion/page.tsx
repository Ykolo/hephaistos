import { Suspense } from "react";
import { AdminLoginForm } from "@/components/admin/login-form";
import { adminRoutes } from "@/lib/routes";
import { isSafeAdminPath } from "@/server/admin-guard";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const REASONS: Record<string, string> = {
  expiree: "Votre session d'administration a expiré (8 h maximum). Reconnectez-vous.",
  inactivite: "Session fermée après 30 minutes d'inactivité. Reconnectez-vous.",
};

/**
 * Connexion à l'administration (HEP-78).
 *
 * Ne dit jamais si une adresse correspond à un compte, ni si ce compte est
 * admin : un client qui se connecte ici atterrit sur la même page 404 que
 * n'importe quelle URL inexistante.
 */
export default function AdminLoginPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <div className="mx-auto max-w-[380px] px-5 py-16">
      <div className="mb-2 text-[11px] uppercase tracking-[.2em] text-muted-ink">Administration</div>
      <h1 className="m-0 mb-8 font-serif text-[28px] font-normal">Connexion</h1>
      <Suspense fallback={null}>
        <LoginContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function LoginContent({ searchParams }: { searchParams: SearchParams }) {
  const { suite, raison } = await searchParams;
  const next = typeof suite === "string" && isSafeAdminPath(suite) ? suite : adminRoutes.orders;
  const notice = typeof raison === "string" ? REASONS[raison] : undefined;

  return (
    <>
      {notice && (
        <p className="mb-6 border border-gold/40 bg-gold/10 p-3 text-[12.5px] leading-[1.6] text-body">
          {notice}
        </p>
      )}
      <AdminLoginForm next={next} />
    </>
  );
}
