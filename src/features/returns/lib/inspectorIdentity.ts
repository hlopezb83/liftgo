/**
 * Hallazgo 9: las inspecciones nuevas guardan `inspected_by` automáticamente
 * con el usuario autenticado. Sólo un administrador puede registrar a otro
 * inspector (el campo de texto ya existía; para el resto queda bloqueado).
 * Las cuatro inspecciones históricas sin inspector no se tocan.
 */

type UserLike = {
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
} | null | undefined;

/** Nombre visible del usuario autenticado (full_name del perfil o su correo). */
export function resolveInspectorName(user: UserLike): string {
  if (!user) return "";
  const meta = user.user_metadata ?? {};
  const fullName = typeof meta.full_name === "string" ? meta.full_name.trim() : "";
  return fullName || user.email?.trim() || "";
}

/**
 * Decide qué nombre se persiste en `inspected_by`:
 * - admin con texto capturado → respeta el texto (capacidad existente);
 * - cualquier otro caso → siempre el usuario autenticado.
 */
export function pickInspectorName(opts: {
  isAdmin: boolean;
  formValue: string;
  currentUserName: string;
}): string {
  const typed = opts.formValue.trim();
  if (opts.isAdmin && typed) return typed;
  return opts.currentUserName;
}
