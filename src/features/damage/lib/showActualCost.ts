// F6: un costo real de $0 en un daño ya cerrado (reparado/facturado) SÍ es
// información (garantía absorbida / sin costo). Solo se oculta mientras el
// daño sigue abierto y no hay costo final que comunicar.
const CLOSED_STATUSES = ["repaired", "invoiced"];

export function shouldShowActualCost(
  actualCost: number | null | undefined,
  status: string | null | undefined,
): boolean {
  if (actualCost == null) return false;
  return actualCost > 0 || CLOSED_STATUSES.includes(status ?? "");
}
