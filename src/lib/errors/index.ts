import { translatePgError } from "./pgErrorCatalog";


/**
 * Extrae un mensaje legible de cualquier valor `unknown` y lo traduce a un
 * mensaje amigable en español mexicano usando el catálogo de errores
 * (restricción → SQLSTATE → texto libre).
 */
export function getErrorMessage(err: unknown): string {
  return translatePgError(err).message;
}
