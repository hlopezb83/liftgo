/**
 * R22-M: traduce los errores de autenticación (que llegan en inglés desde el
 * backend) a mensajes es-MX accionables para el usuario final.
 */
const AUTH_ERROR_MAP: ReadonlyArray<readonly [RegExp, string]> = [
  [/invalid login credentials/i, "Correo o contraseña incorrectos."],
  [/email not confirmed/i, "Tu correo aún no ha sido confirmado. Revisa tu bandeja de entrada."],
  [/user not found/i, "No encontramos una cuenta con ese correo."],
  [/email rate limit exceeded|too many requests|rate limit/i, "Demasiados intentos. Espera unos minutos e inténtalo de nuevo."],
  [/password should be at least/i, "La contraseña es demasiado corta."],
  [/invalid email/i, "El correo electrónico no es válido."],
  [/network|fetch failed|failed to fetch/i, "No pudimos conectar con el servidor. Revisa tu conexión."],
  [/user is banned|banned/i, "Tu cuenta está deshabilitada. Contacta al administrador."],
];

export function getAuthErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error ?? "");
  for (const [pattern, message] of AUTH_ERROR_MAP) {
    if (pattern.test(raw)) return message;
  }
  return "No pudimos completar la operación. Inténtalo de nuevo.";
}
