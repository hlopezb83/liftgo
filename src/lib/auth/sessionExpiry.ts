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

export function isSessionExpiredError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as MaybePgError;
  if (typeof e.code === "string" && EXPIRED_CODES.has(e.code)) return true;
  if (e.status === 401) return true;
  return typeof e.message === "string" && EXPIRED_MESSAGE_RE.test(e.message);
}

/** Sólo para pruebas: reinicia el candado de "ya estoy cerrando sesión". */
export function resetSessionExpiryGuard(): void {
  handling = false;
}

export async function handleSessionExpired(error: unknown): Promise<boolean> {
  if (!isSessionExpiredError(error)) return false;
  if (handling) return true;
  if (typeof window === "undefined") return true;
  // Ya estamos en la pantalla de acceso: no hace falta expulsar de nuevo.
  if (window.location.pathname.startsWith("/auth")) return true;

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
  const back = `${window.location.pathname}${window.location.search}`;
  window.location.assign(`/auth?redirect=${encodeURIComponent(back)}`);
  return true;
}
