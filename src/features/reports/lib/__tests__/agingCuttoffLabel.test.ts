import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatDateMty, toYMD } from "@/lib/format/dateFormats";
import { nowMty } from "@/lib/utils";

/**
 * V27-02 (regresión): la etiqueta "Cartera vencida al día de hoy" usaba
 * `formatDateMty(nowMty())`. nowMty() ya aplica toZonedTime(…, America/Monterrey)
 * y formatDateMty, al recibir un instante (no date-only), vuelve a aplicar
 * toZonedTime. En navegadores con TZ distinta a Monterrey (aquí: TZ=UTC del
 * runner) la doble conversión mostraba el día anterior, aunque el reporte
 * calcula "hoy" en Monterrey.
 *
 * Reloj fijo: 2026-09-09T07:00:00Z = 01:00 del 9 de septiembre en Monterrey.
 * Bajo TZ=UTC el día local del instante ya es 09/09, pero la doble conversión
 * lo recorre al 08/09. La composición con toYMD evita la segunda conversión.
 */
describe("V27-02 — etiqueta de corte de Antigüedad de Cartera", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-09T07:00:00.000Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("formatDateMty(nowMty()) muestra el día anterior bajo TZ=UTC (bug)", () => {
    // Control: documenta la regresión que tenía la composición anterior.
    expect(formatDateMty(nowMty())).toBe("08/09/2026");
  });

  it("formatDateMty(toYMD(nowMty())) muestra el día actual de Monterrey", () => {
    // Fix: toYMD(nowMty()) entrega "YYYY-MM-DD" date-only; formatDateMty lo
    // parsea como fecha local sin aplicar toZonedTime de nuevo.
    expect(formatDateMty(toYMD(nowMty()))).toBe("09/09/2026");
  });

  it("la composición nueva difiere de la anterior justo en el cambio de día", () => {
    expect(formatDateMty(toYMD(nowMty()))).not.toBe(formatDateMty(nowMty()));
  });
});
