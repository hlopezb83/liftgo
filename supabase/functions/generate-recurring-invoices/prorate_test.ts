// Unit tests para el helper de prorrateo (BL-12).
import {
  assertEquals,
  assertStrictEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { computeProrate } from "./prorate.ts";

Deno.test("computeProrate: día 1 no prorratea (mes completo)", () => {
  const r = computeProrate(1, 31, 10_000);
  assertStrictEquals(r.isProrated, false);
  assertEquals(r.billedAmount, 10_000);
  assertEquals(r.proratedDays, 31);
});

Deno.test("computeProrate: día 15 de enero → 17 días de 31, ~54.84% del mes", () => {
  const r = computeProrate(15, 31, 10_000);
  assertStrictEquals(r.isProrated, true);
  assertEquals(r.proratedDays, 17);
  // 10000 * 17/31 = 5483.87
  assertEquals(r.billedAmount, 5_483.87);
});

Deno.test("computeProrate: último día del mes → 1 día prorrateado", () => {
  const r = computeProrate(31, 31, 10_000);
  assertStrictEquals(r.isProrated, true);
  assertEquals(r.proratedDays, 1);
  // 10000 / 31 = 322.58
  assertEquals(r.billedAmount, 322.58);
});

Deno.test("computeProrate: mes de 28 días (febrero no bisiesto)", () => {
  const r = computeProrate(10, 28, 10_000);
  assertStrictEquals(r.isProrated, true);
  assertEquals(r.proratedDays, 19);
  // 10000 * 19/28 = 6785.71
  assertEquals(r.billedAmount, 6_785.71);
});

// Ola 2.2 (BL-B3): reserva que termina el mismo día que arranca el ciclo
// (startDay == daysInMonth) → 1 día facturable, no cero.
Deno.test("computeProrate: startDay == daysInMonth → 1 día", () => {
  const r = computeProrate(30, 30, 9_000);
  assertStrictEquals(r.isProrated, true);
  assertEquals(r.proratedDays, 1);
  // 9000 / 30 = 300
  assertEquals(r.billedAmount, 300);
});

// Ola 2.2 (BL-B2): monthly_rate = 0 → billedAmount = 0 sin dividir por cero.
Deno.test("computeProrate: monthlyRate 0 no divide por cero", () => {
  const r = computeProrate(15, 31, 0);
  assertEquals(r.billedAmount, 0);
  assertStrictEquals(r.isProrated, true);
});
