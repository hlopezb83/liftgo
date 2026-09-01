// R9-18 (fix fail-open): decisión pura de qué items se facturan.
// Regla: si el caller ENVIÓ `selections` (aunque venga vacío), sólo se
// procesan esas combinaciones reserva+periodo; vacío ⇒ 0 items. `bookingIds`
// es el camino legacy y sólo aplica cuando `selections` no fue enviado.

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
): T[] {
  if (Array.isArray(body.selections)) {
    const keys = new Set(
      body.selections
        .filter((s) => s?.bookingId && s?.periodStart)
        .map((s) => `${s.bookingId}|${s.periodStart}`),
    );
    if (keys.size === 0) return [];
    return allItems.filter((i) => keys.has(`${i.bookingId}|${i.startStr}`));
  }
  if (body.bookingIds && body.bookingIds.length > 0) {
    return allItems.filter((i) => body.bookingIds!.includes(i.bookingId));
  }
  return [...allItems];
}
