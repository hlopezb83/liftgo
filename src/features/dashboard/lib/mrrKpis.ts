/**
 * v7.264.2 · Cálculos de KPIs de la página de MRR.
 * La renta promedio se mide por UNIDAD rentada (no por cliente), para que el
 * número no se infle cuando un solo cliente concentra varios montacargas.
 */
export function averageRentPerUnit(totalMrr: number, unitCount: number): number {
  if (unitCount <= 0) return 0;
  return totalMrr / unitCount;
}
