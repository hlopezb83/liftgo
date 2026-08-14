/**
 * Calendario de días inhábiles en México (fecha calendario, sin zona horaria).
 *
 * Incluye:
 * - Oficiales de ley (LFT art. 74): 1 ene, 1er lunes de feb, 3er lunes de mar,
 *   1 may, 16 sep, 3er lunes de nov, 1 dic de cambio de gobierno, 25 dic.
 * - Bancarios adicionales: jueves y viernes santo, 2 nov, 12 dic.
 *
 * Los movibles se calculan por año (lunes n-ésimo y Pascua por Meeus/Gauss),
 * de modo que la función sirve para cualquier año sin mantener listas a mano.
 */

/** Domingo de Pascua del año dado (algoritmo anónimo gregoriano / Meeus). */
export function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

/** N-ésimo día de semana (0=domingo) de un mes. `nth` empieza en 1. */
export function nthWeekday(year: number, month0: number, weekday: number, nth: number): Date {
  const first = new Date(year, month0, 1);
  const offset = (weekday - first.getDay() + 7) % 7;
  return new Date(year, month0, 1 + offset + (nth - 1) * 7);
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

const key = (d: Date) => `${d.getMonth() + 1}-${d.getDate()}`;

/** Mapa "M-D" → etiqueta de los días inhábiles del año. */
export function mxHolidaysForYear(year: number): Map<string, string> {
  const easter = easterSunday(year);
  const entries: [Date, string][] = [
    [new Date(year, 0, 1), "Año Nuevo"],
    [nthWeekday(year, 1, 1, 1), "Día de la Constitución"],
    [nthWeekday(year, 2, 1, 3), "Natalicio de Benito Juárez"],
    [addDays(easter, -3), "Jueves Santo (inhábil bancario)"],
    [addDays(easter, -2), "Viernes Santo (inhábil bancario)"],
    [new Date(year, 4, 1), "Día del Trabajo"],
    [new Date(year, 8, 16), "Día de la Independencia"],
    [new Date(year, 10, 2), "Día de Muertos (inhábil bancario)"],
    [nthWeekday(year, 10, 1, 3), "Día de la Revolución"],
    [new Date(year, 11, 12), "Día de la Virgen de Guadalupe (inhábil bancario)"],
    [new Date(year, 11, 25), "Navidad"],
  ];
  // Transmisión del Poder Ejecutivo Federal: 1 de octubre cada 6 años (2024, 2030…).
  if ((year - 2024) % 6 === 0 && year >= 2024) {
    entries.push([new Date(year, 9, 1), "Transmisión del Poder Ejecutivo Federal"]);
  }
  return new Map(entries.map(([d, label]) => [key(d), label]));
}

/** Etiqueta del día festivo, o null si es un día común. */
export function mxHolidayLabel(date: Date | null | undefined): string | null {
  if (!date || Number.isNaN(date.getTime())) return null;
  return mxHolidaysForYear(date.getFullYear()).get(key(date)) ?? null;
}

export function isMxHoliday(date: Date | null | undefined): boolean {
  return mxHolidayLabel(date) !== null;
}

export function isWeekend(date: Date | null | undefined): boolean {
  if (!date || Number.isNaN(date.getTime())) return false;
  const day = date.getDay();
  return day === 0 || day === 6;
}

/** Nota informativa (no bloqueante) para fines de semana y festivos. */
export function nonBusinessDayNote(date: Date | null | undefined): string | null {
  const holiday = mxHolidayLabel(date);
  if (holiday) return holiday;
  if (!date || !isWeekend(date)) return null;
  return date.getDay() === 6 ? "Sábado (día inhábil)" : "Domingo (día inhábil)";
}

/** Siguiente día hábil (ni fin de semana ni festivo). */
export function nextBusinessDay(date: Date): Date {
  let d = addDays(date, 1);
  for (let i = 0; i < 15 && (isWeekend(d) || isMxHoliday(d)); i++) {
    d = addDays(d, 1);
  }
  return d;
}
