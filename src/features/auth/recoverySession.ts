/**
 * AUTH-REC-01 — estado explícito del flujo "restablecer contraseña".
 *
 * El SDK de Supabase puede consumir y limpiar el fragmento (#access_token…)
 * ANTES de que se monte cualquier listener de React, y la sesión resultante
 * hacía que `AuthGuard` dejara de renderizar `AuthPage` (el formulario de
 * nueva contraseña desaparecía). Este store vive fuera de React: se marca
 * `pending` en el arranque en frío leyendo la URL, y pasa a `active` cuando
 * el SDK confirma el evento/sesión de recuperación.
 *
 * Nunca se guardan ni se registran tokens: sólo el tipo de enlace.
 */
export type RecoveryStatus = "idle" | "pending" | "active" | "error";

let status: RecoveryStatus = "idle";
const listeners = new Set<() => void>();

function set(next: RecoveryStatus) {
  if (status === next) return;
  status = next;
  for (const l of listeners) l();
}

export function getRecoveryStatus(): RecoveryStatus {
  return status;
}

export function subscribeRecovery(cb: () => void): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

/** Enlace de recuperación detectado, sesión aún no confirmada. */
export function markRecoveryPending(): void {
  if (status === "idle") set("pending");
}

/** El SDK confirmó la sesión de recuperación: el formulario ya puede usarse. */
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
  status = "idle";
  for (const l of listeners) l();
}

/**
 * Clasifica una URL de recuperación. Acepta el formato con fragmento
 * (`#type=recovery&access_token=…`), el de query (`?type=recovery`) y los
 * enlaces legacy que llegan a la raíz. Devuelve sólo el estado, nunca tokens.
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
  const type = params.get("type") ?? search.get("type");
  const errorCode = params.get("error") ?? search.get("error")
    ?? params.get("error_code") ?? search.get("error_code");

  if (errorCode) {
    // Un enlace caducado llega como error explícito; no autoriza nada.
    if (type === "recovery" || /expired|invalid|otp/i.test(errorCode)) return "error";
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
