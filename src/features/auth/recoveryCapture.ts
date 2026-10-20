import { supabase } from "@/integrations/supabase/client";
import { rememberedRecoveryPhase, rememberRecoverySession, recoverySessionIdentity, type RecoveryAuthSession } from "./recoveryPersistence";
import {
  detectRecoveryCodeFromHref,
  getRecoveryStatus,
  hasRecoveryCallbackToken,
  markRecoveryActive,
  markRecoveryError,
  matchesRecoveryCallback,
  stripRecoveryCodeFromUrl,
  syncRecoverySessionUser,
} from "./recoverySession";

/**
 * AUTH-REC-01 / P1 — captura TEMPRANA del evento `PASSWORD_RECOVERY`.
 *
 * El SDK puede emitir el evento antes de que React monte cualquier listener,
 * y entonces se perdía. `AuthContext` llama explícitamente al bootstrap antes
 * de renderizar; no depende de que el build conserve imports de side effects.
 *
 * Se conserva sólo identidad de sesión y estado de finalización para sobrevivir
 * recargas: ni tokens, ni logs, ni red adicional. No se llama al SDK desde el callback, para no
 * bloquear su lock interno.
 */
let started = false;

/** Ventana en la que un inicio por recuperación se considera "este enlace". */
const RECOVERY_TOKEN_MAX_AGE_S = 15 * 60;

/** Lee sólo el claim `amr` (sin registrar ni guardar el token). */
export function isFreshRecoveryToken(token: string | null | undefined, nowMs = Date.now()): boolean {
  if (!token) return false;
  try {
    const part = token.split(".")[1];
    if (!part) return false;
    const json = atob(part.replace(/-/g, "+").replace(/_/g, "/"));
    const amr = (JSON.parse(json) as { amr?: Array<{ method?: string; timestamp?: number }> }).amr;
    if (!Array.isArray(amr)) return false;
    const nowS = nowMs / 1000;
    return amr.some((m) => m?.method === "recovery" && typeof m.timestamp === "number" && nowS >= m.timestamp && nowS - m.timestamp <= RECOVERY_TOKEN_MAX_AGE_S);
  } catch {
    return false;
  }
}

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
      ) => Promise<{ data?: { session?: RecoveryAuthSession }; error?: unknown }>;
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
      rememberRecoverySession(data?.session ?? null);
      if (getRecoveryStatus() !== "active") markRecoveryActive(userId);
    })
    .catch(() => {
      markRecoveryError();
    });
}

type AuthChangeEvent = string;
type AuthSession = RecoveryAuthSession;

// AUTH-REC-03: el SDK puede procesar el enlace (#access_token) y emitir
// `PASSWORD_RECOVERY` antes de esta suscripción; entonces sólo llega
// INITIAL_SESSION/SIGNED_IN. Se confirma con la identidad del callback o la
// continuidad de la MISMA sesión; un código pendiente necesita su canje.
function isLateRecoveryEvent(event: AuthChangeEvent, session: AuthSession): boolean {
  if (!["INITIAL_SESSION", "SIGNED_IN", "TOKEN_REFRESHED"].includes(event)) return false;
  if (getRecoveryStatus() === "error") return false;
  if (!matchesRecoveryCallback(session)) return false;
  const phase = rememberedRecoveryPhase(session);
  if (phase === "completed") return false;
  return phase === "unfinished" ||
    ((getRecoveryStatus() === "idle" || hasRecoveryCallbackToken()) && isFreshRecoveryToken(session?.access_token));
}

function handleAuthStateChange(event: AuthChangeEvent, session: AuthSession): void {
  if (event === "PASSWORD_RECOVERY") {
    rememberRecoverySession(session);
    markRecoveryActive(session?.user?.id);
    return;
  }
  // `INITIAL_SESSION` sin sesión puede llegar tarde durante el arranque del
  // SDK; no debe invalidar una recuperación ya confirmada.
  if (event === "INITIAL_SESSION" && !session) return;
  if (isLateRecoveryEvent(event, session)) {
    rememberRecoverySession(session);
    markRecoveryActive(session?.user?.id);
    return;
  }
  // Cambio de usuario o cierre de sesión: el flujo activo deja de valer.
  // Un refresco de token del mismo usuario lo mantiene intacto.
  syncRecoverySessionUser(session?.user?.id ?? null, recoverySessionIdentity(session)?.sessionId);
}

export function startRecoveryCapture(): void {
  if (started || typeof window === "undefined") return;
  started = true;
  supabase.auth.onAuthStateChange(handleAuthStateChange);
  exchangeRecoveryCodeFromUrl();
}

/** Sólo para pruebas: permite volver a registrar la captura. */
export function resetRecoveryCaptureForTests(): void {
  started = false;
}

startRecoveryCapture();

