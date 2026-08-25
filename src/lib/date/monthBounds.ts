import { toYMD } from "./toYMD";

/**
 * Devuelve el primer y último día (YYYY-MM-DD) del mes de `date`,
 * usando componentes locales (sin drift por offset).
 */
export function monthBounds(date: Date): { start: string; end: string } {
  const y = date.getFullYear();
  const m = date.getMonth();
  return {
    start: toYMD(new Date(y, m, 1)),
    end: toYMD(new Date(y, m + 1, 0)), // día 0 del mes siguiente = último día
  };
}
