/**
 * Traductores de errores de base de datos → mensajes de usuario.
 *
 * Desde v7.323.0 la lógica vive en `pgErrorCatalog.ts`, que resuelve por
 * nombre de restricción → SQLSTATE → texto libre. Este módulo se mantiene
 * como fachada estable para los llamadores existentes (`useEntityMutation`).
 */
import { translatePgError, type PgErrorTranslation } from "./pgErrorCatalog";

export type TranslatedDbError = PgErrorTranslation;

/**
 * Devuelve un mensaje traducido para errores conocidos de la DB.
 * Si no matchea nada conocido, `matched=false` y el caller puede seguir su
 * flujo normal (notifyError con el error original).
 */
export function translateDbError(
  error: unknown,
  fallbackTitle: string,
): TranslatedDbError {
  return translatePgError(error, fallbackTitle);
}
