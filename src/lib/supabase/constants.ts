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
 * N-03: los hooks de listado piden una fila extra (limit+1). Si llegan
 * `LIST_FETCH_LIMIT` filas, la lista está realmente truncada: se muestran
 * sólo las primeras `LIST_PAGE_LIMIT` y el Alert deja de tener falsos
 * positivos cuando hay exactamente 500 registros legítimos.
 */
export const LIST_FETCH_LIMIT = LIST_PAGE_LIMIT + 1;

/**
 * Filtro `.or()` para excluir registros marcados como datos E2E
 * (`is_e2e = true`) y conservar los heredados (`is_e2e is null`).
 */
export const EXCLUDE_E2E_FILTER = "is_e2e.is.null,is_e2e.eq.false";

/**
 * True si una lista está realmente truncada. Requiere que el hook haya
 * pedido `LIST_FETCH_LIMIT` (limit+1) filas: con exactamente
 * `LIST_PAGE_LIMIT` registros ya NO se muestra el aviso (falso positivo).
 */
export function hasReachedListLimit<T>(rows: ReadonlyArray<T> | null | undefined): boolean {
  return (rows?.length ?? 0) > LIST_PAGE_LIMIT;
}

/** Recorta la lista cruda (limit+1) a lo que se muestra en pantalla. */
export function visibleListRows<T>(rows: ReadonlyArray<T> | null | undefined): T[] {
  return (rows ?? []).slice(0, LIST_PAGE_LIMIT);
}
