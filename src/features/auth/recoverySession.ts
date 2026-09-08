/**
 * AUTH-REC-01 — estado explícito del flujo "restablecer contraseña".
 *
 * El SDK de Supabase puede consumir y limpiar el fragmento (#access_token…)
 * ANTES de que se monte cualquier listener de React, y la sesión resultante
 * hacía que `AuthGuard` dejara de renderizar `AuthPage` (el formulario de
 * nueva contraseña desaparecía). Este store vive fuera de React: se marca
 * `pending` en el arranque en frío leyendo la URL, y sólo pasa a `active`
 * cuando el SDK emite `PASSWORD_RECOVERY`.
 *
 * P1: una sesión cualquiera (por ejemplo la de otro usuario que ya estaba
 * abierta) NO confirma la recuperación. auth-js 2.115.0 conserva la sesión
 * previa cuando el enlace es inválido, así que confirmar por "hay sesión"
 * permitía cambiar la contraseña de una cuenta ajena.
 *
 * Nunca se guardan ni se registran tokens: sólo el tipo de enlace.
 */
export type RecoveryStatus = "idle" | "pending" | "active" | "error";

/** Límite sólo para la inicialización: si el SDK nunca concluye, no se cuelga. */
export const RECOVERY_PENDING_TIMEOUT_MS = 15_000;

let status: RecoveryStatus = "idle";
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
export function markRecoveryPending(): void {
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
export function markRecoveryActive(): void {
  set("active");
}

/** Enlace inválido/expirado: se muestra el error, nunca el formulario. */
export function markRecoveryError(): void {
  if (status !== "active") set("error");
}

/** Fin del flujo (éxito o cancelación). */
export function endRecovery(): void {
  set("idle");
}

/** Sólo para pruebas: vuelve el store a su estado inicial. */
export function resetRecoveryForTests(): void {
  clearPendingTimer();
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
  let hash = "";
  let query = "";
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

/** Arranque en frío: se ejecuta antes de que el SDK limpie el fragmento. */
export function initRecoveryFromLocation(href?: string): void {
  const target = href ?? (typeof window !== "undefined" ? window.location.href : "");
  if (!target) return;
  const detected = detectRecoveryFromHref(target);
  if (detected === "pending") markRecoveryPending();
  else if (detected === "error") markRecoveryError();
}

if (typeof window !== "undefined") initRecoveryFromLocation();
