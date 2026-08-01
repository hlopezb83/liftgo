import type { DateRange } from "react-day-picker";

const normalize = (d?: Date) =>
  d ? new Date(d.getFullYear(), d.getMonth(), d.getDate()) : undefined;

export const normalizeRange = (r?: DateRange): DateRange | undefined =>
  r ? { from: normalize(r.from), to: normalize(r.to) } : undefined;

/** `from == to` es el primer clic de react-day-picker, no un rango real. */
export const isPartialRange = (r?: DateRange): boolean =>
  !!r?.from && (!r.to || r.from.getTime() === r.to.getTime());

/**
 * Decide el siguiente estado del rango tras un clic en el calendario.
 * - reinicio: ya había un rango REAL (from != to) → el clic inicia uno nuevo.
 * - `apply`: el rango quedó completo (from != to) → se auto-aplica.
 * - parcial: primer clic (from == to) → sigue abierto esperando el fin.
 */
export function nextRangeState(
  local: DateRange | undefined,
  picked: DateRange | undefined,
): { range?: DateRange; apply: boolean } {
  // R6-FE-11c: con un rango COMPLETO previo, un clic nuevo reinicia la
  // selección. Ojo: `from == to` no cuenta como completo (R10-FE-02b), si no
  // el segundo clic reiniciaría en vez de cerrar el rango (hacían falta 3).
  if (local?.from && local.to && !isPartialRange(local) && picked?.from) {
    return { range: normalizeRange({ from: picked.from, to: undefined }), apply: false };
  }
  const next = normalizeRange(picked);
  return { range: next, apply: !!next?.from && !!next.to && !isPartialRange(next) };
}
