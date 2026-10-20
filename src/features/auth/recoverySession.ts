import { activeRecoverySessionId, completeRememberedRecovery, recoverySessionIdentity, type RecoveryAuthSession } from "./recoveryPersistence";

/**
 * AUTH-REC-01 — estado explícito del flujo "restablecer contraseña".
 *
 * El SDK de Supabase puede consumir y limpiar el fragmento (#access_token…)
 * ANTES de que se monte cualquier listener de React, y la sesión resultante
 * hacía que `AuthGuard` dejara de renderizar `AuthPage` (el formulario de
 * nueva contraseña desaparecía). Este store vive fuera de React: se marca
 * `pending` en el arranque en frío leyendo la URL, y sólo pasa a `active`
 * cuando el SDK confirma la recuperación. La continuidad tras recargar se
 * vincula al usuario y session_id confirmados, nunca a "hay una sesión".
 *
 * P1: una sesión cualquiera (por ejemplo la de otro usuario que ya estaba
 * abierta) NO confirma la recuperación. auth-js 2.115.0 conserva la sesión
 * previa cuando el enlace es inválido, así que confirmar por "hay sesión"
 * permitía cambiar la contraseña de una cuenta ajena.
 *
 * Nunca se guardan ni se registran tokens adicionales: sólo identidad y fase
 * del flujo. Este gate es de UI, no una restricción de permisos del backend.
 */
export type RecoveryStatus = "idle" | "pending" | "active" | "error";

/** Límite sólo para la inicialización: si el SDK nunca concluye, no se cuelga. */
export const RECOVERY_PENDING_TIMEOUT_MS = 15_000;

let status: RecoveryStatus = "idle";
/**
 * P1b: identidad del usuario cuya recuperación fue confirmada. Sólo el id
 * (nunca tokens, nunca persistido). `active` por sí solo probaba que ALGUNA
 * sesión de recuperación existió, no que siga siendo la sesión actual: si el
 * SDK cambiaba de cuenta (otra pestaña) el formulario habría actuado sobre
 * la sesión ajena.
 */
let recoveryUserId: string | null = null;
// Only identity claims are retained, never the incoming bearer token. `null`
// means an incoming token could not be identified, `undefined` means no token.
let callbackSessionId: string | null | undefined;
let callbackHasCode = false;

export function matchesRecoveryCallback(session: RecoveryAuthSession): boolean {
  return !callbackHasCode && (callbackSessionId === undefined ||
    (callbackSessionId !== null && recoverySessionIdentity(session)?.sessionId === callbackSessionId));
}

export function hasRecoveryCallbackToken(): boolean { return callbackSessionId !== undefined; }
const listeners = new Set<() => void>();
let pendingTimer: ReturnType<typeof setTimeout> | null = null;

function clearPendingTimer() {
  if (pendingTimer !== null) {
    clearTimeout(pendingTimer);
    pendingTimer = null;
  }
}

function set(next: RecoveryStatus) {
  if (status === next) return;
  status = next;
  if (next !== "pending") clearPendingTimer();
  for (const l of listeners) l();
}

export function getRecoveryStatus(): RecoveryStatus {
  return status;
}

export function subscribeRecovery(cb: () => void): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

/**
 * Enlace de recuperación detectado, sesión aún no confirmada por el SDK.
 * Si el SDK nunca emite `PASSWORD_RECOVERY` (enlace incompleto, token
 * inválido, con o sin sesión ajena abierta) el flujo termina en `error`,
 * nunca en un `pending` infinito ni en `active`.
 */
function markRecoveryPending(): void {
  if (status !== "idle") return;
  set("pending");
  clearPendingTimer();
  pendingTimer = setTimeout(() => {
    pendingTimer = null;
    if (status === "pending") set("error");
  }, RECOVERY_PENDING_TIMEOUT_MS);
}

/**
 * El SDK confirmó la recuperación (`PASSWORD_RECOVERY`): el formulario ya
 * puede usarse. Es la ÚNICA vía de confirmación; `SIGNED_IN`/`INITIAL_SESSION`
 * ordinarios no autorizan nada.
 */
export function markRecoveryActive(userId: string | null | undefined): void {
  // Sin identidad no hay recuperación verificable: se trata como enlace roto.
  if (!userId) { set("error"); return; }
  recoveryUserId = userId;
  set("active");
}

/** Usuario de la recuperación confirmada (sólo id, en memoria). */
export function getRecoveryUserId(): string | null {
  return recoveryUserId;
}

/**
 * Sincroniza el flujo con la sesión actual del SDK. Un `TOKEN_REFRESHED` del
 * MISMO usuario no rompe nada; cerrar sesión o cambiar de usuario invalida el
 * flujo activo (el formulario deja de ser utilizable) sin tocar esa sesión.
 */
export function syncRecoverySessionUser(userId: string | null | undefined, sessionId?: string): void {
  if (status !== "active") return;
  const activeSessionId = recoveryUserId ? activeRecoverySessionId(recoveryUserId) : null;
  if (userId && userId === recoveryUserId && (!sessionId || !activeSessionId || sessionId === activeSessionId)) return;
  recoveryUserId = null;
  set("error");
}

/** Enlace inválido/expirado: se muestra el error, nunca el formulario. */
export function markRecoveryError(): void {
  if (status !== "active") set("error");
}

/** Fin del flujo (éxito o cancelación). */
export function endRecovery(): void {
  recoveryUserId = null;
  callbackSessionId = undefined;
  callbackHasCode = false;
  set("idle");
}

/** Snapshot before an async password update; a later account must not finish it. */
export function getRecoveryIdentityKey(): string | null {
  return status === "active" && recoveryUserId
    ? JSON.stringify([recoveryUserId, activeRecoverySessionId(recoveryUserId)]) : null;
}

/** Record completion only for the exact flow that submitted the update. */
export function completeRecovery(expectedIdentity = getRecoveryIdentityKey()): boolean {
  if (!expectedIdentity || expectedIdentity !== getRecoveryIdentityKey()) return false;
  completeRememberedRecovery(recoveryUserId);
  endRecovery();
  return true;
}

/** Sólo para pruebas: vuelve el store a su estado inicial. */
export function resetRecoveryForTests(): void {
  clearPendingTimer();
  recoveryUserId = null;
  callbackSessionId = undefined;
  callbackHasCode = false;
  status = "idle";
  for (const l of listeners) l();
}

/**
 * Clasifica una URL de recuperación. Acepta el formato con fragmento
 * (`#type=recovery&access_token=…`), el de query (`?type=recovery`) y los
 * enlaces legacy que llegan a la raíz. Devuelve sólo el estado, nunca tokens
 * ni el detalle textual del proveedor.
 */
export function detectRecoveryFromHref(href: string): RecoveryStatus {
  let hash: string;
  let query: string;
  try {
    const url = new URL(href, "http://localhost");
    hash = url.hash.replace(/^#/, "");
    query = url.search.replace(/^\?/, "");
  } catch {
    return "idle";
  }
  const params = new URLSearchParams(hash);
  const search = new URLSearchParams(query);
  const get = (k: string) => params.get(k) ?? search.get(k);
  const type = get("type");
  // P2: el enlace caducado estándar llega SIN `type`, con `error=access_denied`
  // y el motivo real en `error_code`/`error_description`. Se examinan todos los
  // campos: si sólo se mirara el primero, `access_denied` eclipsaría a
  // `otp_expired` y el enlace se trataba como si no fuera de recuperación.
  const errorFields = [get("error"), get("error_code"), get("error_description")]
    .filter((v): v is string => Boolean(v));

  if (errorFields.length > 0) {
    if (type === "recovery") return "error";
    // Sin `type`: se reconoce por el motivo del proveedor.
    if (errorFields.some((v) => /expired|invalid|otp|recovery|access_denied/i.test(v))) {
      return "error";
    }
    return "idle";
  }
  if (type === "recovery") return "pending";
  return "idle";
}

/**
 * AUTH-REC-02 — enlaces con código (`?code=…`).
 *
 * Los correos de autenticación pueden entregar el enlace en formato "code"
 * en vez de fragmento. Si nadie canjea ese código, el SDK no emite
 * `PASSWORD_RECOVERY`, no hay sesión y el usuario acababa viendo la pantalla
 * de inicio de sesión en lugar del formulario de nueva contraseña.
 *
 * Esta app NO usa OAuth social (no hay `signInWithOAuth` en el código), así
 * que un `?code=` en la URL sólo puede venir de un enlace de correo.
 * Devuelve el código, nunca lo registra.
 */
export function detectRecoveryCodeFromHref(href: string): string | null {
  try {
    const url = new URL(href, "http://localhost");
    const code = url.searchParams.get("code");
    if (!code) return null;
    const type = url.searchParams.get("type");
    if (type && type !== "recovery") return null;
    if (url.searchParams.get("error")) return null;
    return code;
  } catch {
    return null;
  }
}

/** Quita el código de la barra de direcciones (un solo uso, sin historial). */
export function stripRecoveryCodeFromUrl(): void {
  if (typeof window === "undefined") return;
  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has("code")) return;
    url.searchParams.delete("code");
    window.history.replaceState(
      window.history.state,
      "",
      `${url.pathname}${url.search}${url.hash}`,
    );
  } catch {
    /* sin efecto si el navegador bloquea replaceState */
  }
}

/** Arranque en frío: se ejecuta antes de que el SDK limpie el fragmento. */
export function initRecoveryFromLocation(href?: string): void {
  const target = href ?? (typeof window !== "undefined" ? window.location.href : "");
  if (!target) return;
  try {
    const url = new URL(target, "http://localhost");
    callbackHasCode = !!detectRecoveryCodeFromHref(target);
    const hash = new URLSearchParams(url.hash.slice(1));
    if (hash.has("access_token")) {
      callbackSessionId = recoverySessionIdentity({ user: { id: "callback" }, access_token: hash.get("access_token") ?? "" })?.sessionId ?? null;
    }
  } catch { /* classification below handles malformed URLs */ }
  const detected = detectRecoveryFromHref(target);
  if (detected === "pending") markRecoveryPending();
  else if (detected === "error") markRecoveryError();
  else if (detectRecoveryCodeFromHref(target)) markRecoveryPending();
}

if (typeof window !== "undefined") initRecoveryFromLocation();

