import { supabase } from "@/integrations/supabase/client";
import { notifyWarning } from "@/lib/ui/appFeedback";

/**
 * G-C3: hasta ahora un JWT vencido sólo producía el toast "Tu sesión expiró"
 * desde `pgErrorCatalog`, pero nadie cerraba la sesión ni mandaba al login:
 * `onAuthStateChange` no se dispara por un 401 de PostgREST, así que el usuario
 * quedaba atrapado en una pantalla muerta hasta recargar a mano.
 *
 * Este helper detecta el caso desde los handlers globales de React Query y
 * fuerza `signOut()` + redirección, una sola vez por sesión de página.
 */

const EXPIRED_CODES = new Set(["PGRST301", "PGRST303"]);
const EXPIRED_MESSAGE_RE = /\b(jwt expired|invalid jwt|token is expired|refresh token not found)\b/i;

let handling = false;

interface MaybePgError {
  code?: unknown;
  status?: unknown;
  message?: unknown;
}

function isSessionExpiredError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as MaybePgError;
  if (typeof e.code === "string" && EXPIRED_CODES.has(e.code)) return true;
  if (e.status === 401) return true;
  return typeof e.message === "string" && EXPIRED_MESSAGE_RE.test(e.message);
}

export async function handleSessionExpired(error: unknown): Promise<boolean> {
  if (!isSessionExpiredError(error)) return false;
  if (handling) return true;
  if (typeof window === "undefined") return true;
  // No expulsar de nuevo desde los accesos públicos ni desde recuperación.
  const { pathname, search } = window.location;
  if (["/login", "/auth", "/platform/login"].includes(pathname)) return true;

  handling = true;
  notifyWarning("Tu sesión expiró", {
    description: "Te llevamos a la pantalla de acceso para iniciar sesión de nuevo.",
    dedupeKey: "session-expired",
  });
  try {
    await supabase.auth.signOut();
  } catch {
    // Un signOut fallido no debe impedir la redirección.
  }
  window.location.assign(expiredSessionDestination(pathname, search));
  return true;
}

/** El Centro conserva su acceso independiente incluso al caducar el token. */
function expiredSessionDestination(pathname: string, search: string): string {
  if (pathname === "/platform" || pathname.startsWith("/platform/")) {
    // El login de plataforma valida next contra su lista de rutas internas.
    return `/platform/login?next=${encodeURIComponent(pathname)}`;
  }
  return `/login?redirect=${encodeURIComponent(`${pathname}${search}`)}`;
}
