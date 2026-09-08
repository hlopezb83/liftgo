import { supabase } from "@/integrations/supabase/client";
import { markRecoveryActive, syncRecoverySessionUser } from "./recoverySession";

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
}

/** Sólo para pruebas: permite volver a registrar la captura. */
export function resetRecoveryCaptureForTests(): void {
  started = false;
}

startRecoveryCapture();
