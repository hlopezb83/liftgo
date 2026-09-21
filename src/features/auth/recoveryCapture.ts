import { supabase } from "@/integrations/supabase/client";
import {
  detectRecoveryCodeFromHref,
  getRecoveryStatus,
  markRecoveryActive,
  markRecoveryError,
  stripRecoveryCodeFromUrl,
  syncRecoverySessionUser,
} from "./recoverySession";

/**
 * AUTH-REC-01 / P1 — captura TEMPRANA del evento `PASSWORD_RECOVERY`.
 *
 * El SDK puede emitir el evento antes de que React monte cualquier listener,
 * y entonces se perdía. Esta suscripción se registra al importar el módulo
 * (lo hace `AuthContext`, que entra en el grafo antes de renderizar).
 *
 * Sólo se conserva estado mínimo en memoria: ni tokens, ni logs, ni red
 * adicional. Tampoco se llama al SDK desde dentro del callback, para no
 * bloquear su lock interno.
 */
let started = false;

/**
 * AUTH-REC-02 — enlaces de correo en formato `?code=…`.
 *
 * Sin canje explícito no hay sesión de recuperación ni evento del SDK: el
 * usuario aterrizaba en la pantalla de inicio de sesión. Se canjea una sola
 * vez, se limpia la URL y el resultado decide `active` o `error`. El código
 * nunca se registra ni se persiste.
 */
export function exchangeRecoveryCodeFromUrl(): void {
  if (typeof window === "undefined") return;
  const code = detectRecoveryCodeFromHref(window.location.href);
  if (!code) return;
  const exchange = (
    supabase.auth as unknown as {
      exchangeCodeForSession?: (
        code: string,
      ) => Promise<{ data?: { session?: { user?: { id?: string } } | null }; error?: unknown }>;
    }
  ).exchangeCodeForSession;
  if (typeof exchange !== "function") return;
  stripRecoveryCodeFromUrl();
  void exchange
    .call(supabase.auth, code)
    .then(({ data, error }) => {
      const userId = data?.session?.user?.id;
      if (error || !userId) {
        markRecoveryError();
        return;
      }
      if (getRecoveryStatus() !== "active") markRecoveryActive(userId);
    })
    .catch(() => {
      markRecoveryError();
    });
}

export function startRecoveryCapture(): void {
  if (started || typeof window === "undefined") return;
  started = true;
  supabase.auth.onAuthStateChange((event, session) => {
    if (event === "PASSWORD_RECOVERY") {
      markRecoveryActive(session?.user?.id);
      return;
    }
    // `INITIAL_SESSION` sin sesión puede llegar tarde durante el arranque del
    // SDK; no debe invalidar una recuperación ya confirmada.
    if (event === "INITIAL_SESSION" && !session) return;
    // Cambio de usuario o cierre de sesión: el flujo activo deja de valer.
    // Un refresco de token del mismo usuario lo mantiene intacto.
    syncRecoverySessionUser(session?.user?.id ?? null);
  });
  exchangeRecoveryCodeFromUrl();
}

/** Sólo para pruebas: permite volver a registrar la captura. */
export function resetRecoveryCaptureForTests(): void {
  started = false;
}

startRecoveryCapture();

