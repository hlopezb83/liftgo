// Exercise the same inclusive end-date predicate used by buildPlan.
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { dateOnlyToMty, isBookingEnded } from "./periods.ts";

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
