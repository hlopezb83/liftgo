// Catch-up loop (v7.138.0): garantiza que reservas atrasadas ≥ 2 meses
// recuperen los periodos omitidos en una sola corrida en vez de quedar
// atrapadas por la guarda period_too_old (removida).
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const MAX_CATCHUP_ITERATIONS = 24;

function dateOnlyToMty(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
function toIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function lastOfMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
}

// Simula el loop de buildPlan (sin BD): devuelve la lista de periodos que
// SÍ se facturarían para una reserva con historial `lastBilled` y `endDate`,
// tomando `today` como hoy. Refleja el mismo predicado que index.ts.
function planPeriods(
  lastBilled: string | null,
  startDate: string,
  endDate: string | null,
  today: string,
): Array<{ start: string; end: string }> {
  const now = dateOnlyToMty(today);
  let virtual = lastBilled;
  const periods: Array<{ start: string; end: string }> = [];

  for (let i = 0; i < MAX_CATCHUP_ITERATIONS; i++) {
    let billingStart: Date;
    if (virtual) {
      const lb = dateOnlyToMty(virtual);
      billingStart = new Date(
        Date.UTC(lb.getUTCFullYear(), lb.getUTCMonth() + 1, 1),
      );
    } else {
      const sd = dateOnlyToMty(startDate);
      billingStart = sd.getUTCDate() === 1 ? sd : sd;
    }
    const billingEnd = lastOfMonth(billingStart);

    if (endDate && dateOnlyToMty(endDate) < billingStart) break;
    if (now < billingStart) break;

    periods.push({ start: toIso(billingStart), end: toIso(billingEnd) });
    virtual = toIso(billingEnd);
  }
  return periods;
}

Deno.test("catch-up: 2 meses atrasado genera 2 facturas de recuperación", () => {
  // lastBilled=2026-04-30, hoy=2026-07-21 → debe generar may/jun/jul (jul
  // porque ya estamos dentro del mes actual).
  const r = planPeriods("2026-04-30", "2025-01-01", "2029-01-01", "2026-07-21");
  assertEquals(r.length, 3);
  assertEquals(r[0], { start: "2026-05-01", end: "2026-05-31" });
  assertEquals(r[1], { start: "2026-06-01", end: "2026-06-30" });
  assertEquals(r[2], { start: "2026-07-01", end: "2026-07-31" });
});

Deno.test("catch-up: reserva al día sólo genera el mes actual", () => {
  // lastBilled=2026-06-30, hoy=2026-07-21 → sólo julio.
  const r = planPeriods("2026-06-30", "2025-01-01", "2029-01-01", "2026-07-21");
  assertEquals(r.length, 1);
  assertEquals(r[0], { start: "2026-07-01", end: "2026-07-31" });
});

Deno.test("catch-up: reserva ya al día del mes actual no factura nada", () => {
  const r = planPeriods("2026-07-31", "2025-01-01", "2029-01-01", "2026-07-21");
  assertEquals(r.length, 0);
});

Deno.test("catch-up: end_date corta el loop antes de rebasarlo", () => {
  // Reserva terminó en junio; hoy es julio → sólo se factura junio, no julio.
  const r = planPeriods("2026-04-30", "2025-01-01", "2026-06-30", "2026-07-21");
  assertEquals(r.length, 2);
  assertEquals(r[1].end, "2026-06-30");
});

Deno.test("catch-up: reserva pausada 6 meses recupera todos", () => {
  const r = planPeriods("2025-12-31", "2025-01-01", "2029-01-01", "2026-07-21");
  assertEquals(r.length, 7); // ene–jul 2026
  assertEquals(r[0].start, "2026-01-01");
  assertEquals(r[6].end, "2026-07-31");
});

Deno.test("catch-up: tope duro MAX_CATCHUP_ITERATIONS respetado", () => {
  // lastBilled muy antiguo, hoy muy adelante → no debe exceder 24 iteraciones.
  const r = planPeriods("2020-01-31", "2019-01-01", "2050-01-01", "2026-07-21");
  assertEquals(r.length, MAX_CATCHUP_ITERATIONS);
});
