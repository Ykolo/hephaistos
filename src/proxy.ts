import { NextResponse, type NextRequest } from "next/server";
import {
  ADMIN_2FA_SETUP_PATH,
  ADMIN_LOGIN_PATH,
  checkAdminAccess,
  denialRedirect,
} from "@/server/admin-guard";

/**
 * Porte d'entrée de `/admin` (HEP-78).
 *
 * Le proxy passe sur **chaque** requête, y compris les navigations côté
 * client et les appels de Server Actions, qui ne refont pas le rendu du
 * layout : c'est lui qui coupe une session expirée au milieu d'une journée
 * de travail. Le layout et chaque action revérifient derrière lui.
 *
 * Next 16 exécute le proxy sur le runtime Node.js : la session est lue en
 * base, pas seulement devinée à partir de la présence d'un cookie.
 */
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // La page de connexion doit rester accessible sans session.
  if (pathname === ADMIN_LOGIN_PATH) return NextResponse.next();

  const access = await checkAdminAccess(request.headers, {
    // L'écran d'activation du TOTP est le seul ouvert à un admin sans TOTP.
    allowWithout2fa: pathname === ADMIN_2FA_SETUP_PATH,
  });
  if (access.ok) return NextResponse.next();

  const target = denialRedirect(access.reason, `${pathname}${search}`);
  if (!target) {
    // Rôle insuffisant : réponse identique à une URL inexistante.
    return new NextResponse("Not Found", { status: 404 });
  }
  return NextResponse.redirect(new URL(target, request.url));
}

export const config = {
  matcher: ["/admin", "/admin/:path*"],
};
