/**
 * Constantes compartidas para queries a Supabase desde el cliente.
 *
 * `LIST_PAGE_LIMIT` define el techo de filas que devuelven los hooks de
 * listado (`useBookings`, `useInvoices`, etc.). Cuando una lista alcanza
 * este límite, la página debe mostrar un aviso visible para que el
 * usuario refine sus filtros — nunca truncar silenciosamente.
 */
export const LIST_PAGE_LIMIT = 500;

/**
 * Filtro `.or()` para excluir registros marcados como datos E2E
 * (`is_e2e = true`) y conservar los heredados (`is_e2e is null`).
 */
export const EXCLUDE_E2E_FILTER = "is_e2e.is.null,is_e2e.eq.false";

/** True si una lista alcanzó el límite y probablemente está truncada. */
export function hasReachedListLimit<T>(rows: ReadonlyArray<T> | null | undefined): boolean {
  return (rows?.length ?? 0) >= LIST_PAGE_LIMIT;
}
