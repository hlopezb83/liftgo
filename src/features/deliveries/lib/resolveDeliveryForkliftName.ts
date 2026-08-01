/**
 * R9-P2-06: resolución del nombre de montacargas en la lista de entregas.
 *
 * La consulta de entregas ya trae `forklifts(name, model)`, pero la pantalla
 * usaba únicamente `useForkliftMap`, que puede venir filtrado/paginado: si la
 * unidad no estaba en ese mapa la celda quedaba en "—". El join es la fuente
 * primaria y el mapa sólo el respaldo.
 */
type ForkliftNameSource = {
  forklift_id: string;
  forklifts?: { name?: string | null } | null;
};

export function resolveDeliveryForkliftName(
  row: ForkliftNameSource,
  forkliftMap: Map<string, { name?: string | null }>,
): string | undefined {
  return row.forklifts?.name || forkliftMap.get(row.forklift_id)?.name || undefined;
}
