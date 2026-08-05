const FOLIO_MESSAGE =
  "No se pudo generar un folio disponible para la cotización. Vuelve a intentarlo; si el problema continúa, avisa al administrador (secuencia de folios desincronizada).";

function errorCode(error: unknown): string | undefined {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code?: unknown }).code;
    return typeof code === "string" ? code : undefined;
  }
  return undefined;
}

/**
 * Mensaje de error al crear una cotización.
 * Sólo los conflictos de folio (23505 sobre `quote_number`) muestran el texto
 * de secuencia desincronizada; el resto expone el mensaje real de la base de
 * datos (p. ej. validaciones de partidas) para no confundir al usuario.
 */
export function quoteCreateErrorMessage(error: Error): string {
  const message = error.message ?? "";
  if (errorCode(error) === "23505" && /quote_number/i.test(message)) return FOLIO_MESSAGE;
  return message || FOLIO_MESSAGE;
}
