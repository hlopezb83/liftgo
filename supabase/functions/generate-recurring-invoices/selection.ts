// R9-18 (fix fail-open): decisión pura de qué items se facturan.
// Regla: si el caller ENVIÓ `selections` (aunque venga vacío), sólo se
// procesan esas combinaciones reserva+periodo; vacío ⇒ 0 items. `bookingIds`
// es el camino legacy y sólo aplica cuando `selections` no fue enviado.
// Si no llega ningún selector, la función devuelve `null` y el caller debe
// responder 400: nunca se factura "todo" por omisión.

export interface SelectionEntry {
  bookingId?: string;
  periodStart?: string;
}

export interface SelectableItem {
  bookingId: string;
  startStr: string;
}

export function selectTargetItems<T extends SelectableItem>(
  allItems: readonly T[],
  body: { selections?: SelectionEntry[]; bookingIds?: string[] },
): T[] | null {
  if (Array.isArray(body.selections)) {
    const keys = new Set(
      body.selections
        .filter((s) => s?.bookingId && s?.periodStart)
        .map((s) => `${s.bookingId}|${s.periodStart}`),
    );
    if (keys.size === 0) return [];
    return allItems.filter((i) => keys.has(`${i.bookingId}|${i.startStr}`));
  }
  if (Array.isArray(body.bookingIds)) {
    const ids = new Set(body.bookingIds.filter((id) => typeof id === "string" && id));
    if (ids.size === 0) return [];
    return allItems.filter((i) => ids.has(i.bookingId));
  }
  // Sin ningún selector explícito no hay camino implícito a "todo".
  return null;
}
