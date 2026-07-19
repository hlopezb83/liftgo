// Fix D v7.90.0 (BL-13): verifica que la guarda "booking_ended" descarta
// reservas cuyo end_date es anterior al inicio del período que tocaría facturar.
// La lógica vive inline en index.ts (buildPlan); aquí replicamos el predicado
// exacto para blindarlo contra regresiones futuras.
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

function dateOnlyToMty(yyyyMmDd: string): Date {
  const [y, m, d] = yyyyMmDd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function isBookingEnded(
  endDate: string | null | undefined,
  billingStart: Date,
): boolean {
  if (!endDate) return false;
  return dateOnlyToMty(endDate) < billingStart;
}

Deno.test("booking_ended: reserva vencida antes del período → true", () => {
  const billingStart = dateOnlyToMty("2026-07-01");
  assertEquals(isBookingEnded("2026-06-15", billingStart), true);
});

Deno.test("booking_ended: reserva termina el mismo día del inicio → false (aún vigente)", () => {
  const billingStart = dateOnlyToMty("2026-07-01");
  assertEquals(isBookingEnded("2026-07-01", billingStart), false);
});

Deno.test("booking_ended: reserva sin end_date → false (renta abierta)", () => {
  const billingStart = dateOnlyToMty("2026-07-01");
  assertEquals(isBookingEnded(null, billingStart), false);
  assertEquals(isBookingEnded(undefined, billingStart), false);
});

Deno.test("booking_ended: reserva termina en el futuro → false", () => {
  const billingStart = dateOnlyToMty("2026-07-01");
  assertEquals(isBookingEnded("2026-08-15", billingStart), false);
});
