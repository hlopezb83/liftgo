type SaleForkliftModel = {
  id: string;
  status: string;
  manufacturer: string | null;
  model: string | null;
};

function normalizeLabel(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("es-MX");
}

function modelLabel(forklift: SaleForkliftModel): string {
  return [forklift.manufacturer, forklift.model].filter(Boolean).join(" ");
}

/**
 * Matches the complete generated sale description against a forklift's
 * manufacturer and model. Exact normalized labels support multi-word values
 * without accidentally matching a shorter model prefix.
 */
export function filterSaleForkliftsForLine<T extends SaleForkliftModel>(
  description: string,
  candidates: readonly T[],
  assignedIds: ReadonlySet<string>,
): T[] {
  const label = normalizeLabel(description.replace(/\s*-\s*Venta de equipo$/i, ""));
  if (!label) return [];

  return candidates.filter((forklift) =>
    forklift.status === "available"
    && !assignedIds.has(forklift.id)
    && normalizeLabel(modelLabel(forklift)) === label,
  );
}
