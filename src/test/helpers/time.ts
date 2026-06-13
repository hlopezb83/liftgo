import { afterEach, beforeEach, vi } from "vitest";

/**
 * Fija el reloj del sistema a un instante concreto interpretado en horario de
 * Monterrey (UTC-06:00). Útil en tests cuya lógica depende de "hoy" o de
 * cálculos de día de la semana.
 *
 * Uso (dentro de un describe):
 *   useFakeTimeMty("2026-06-10T12:00:00");
 *
 * Internamente registra beforeEach/afterEach para fijar/restaurar timers.
 */
export function useFakeTimeMty(isoLocal: string): void {
  beforeEach(() => {
    vi.useFakeTimers();
    // -06:00 es Monterrey estándar; el proyecto no usa horario de verano.
    vi.setSystemTime(new Date(`${isoLocal}-06:00`));
  });
  afterEach(() => {
    vi.useRealTimers();
  });
}
