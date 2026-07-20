import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  fromCents,
  roundMoney,
  stampVariance,
  sumMoney,
  sumMoneyCents,
  toCents,
} from "./money.ts";

Deno.test("toCents redondea correctamente montos positivos", () => {
  assertEquals(toCents(1.005), 101); // half-away-from-zero
  assertEquals(toCents(1.004), 100);
  assertEquals(toCents(0), 0);
  assertEquals(toCents(123.456), 12346);
});

Deno.test("toCents maneja negativos con simetría", () => {
  assertEquals(toCents(-1.005), -101);
  assertEquals(toCents(-1.004), -100);
});

Deno.test("toCents acepta strings y valores no finitos", () => {
  assertEquals(toCents("12.34"), 1234);
  assertEquals(toCents(null), 0);
  assertEquals(toCents(undefined), 0);
  assertEquals(toCents(Number.NaN), 0);
  assertEquals(toCents(Number.POSITIVE_INFINITY), 0);
});

Deno.test("fromCents devuelve number con 2 decimales", () => {
  assertEquals(fromCents(12345), 123.45);
  assertEquals(fromCents(-100), -1);
});

Deno.test("roundMoney = fromCents(toCents(n))", () => {
  assertEquals(roundMoney(1.005), 1.01);
  assertEquals(roundMoney(0.1 + 0.2), 0.3); // 0.30000000000000004 → 0.3
});

Deno.test("sumMoney suma con precisión exacta (sin drift)", () => {
  assertEquals(sumMoney([1.005, 2.005, 3.005]), 6.03);
  assertEquals(sumMoney([0.1, 0.2, 0.3]), 0.6);
  assertEquals(sumMoneyCents([1.005, 2.005]), 201);
});

Deno.test("stampVariance devuelve diff absoluta en pesos", () => {
  assertEquals(stampVariance(100, 100), 0);
  assertEquals(stampVariance(100.5, 100.49), 0.01);
  assertEquals(stampVariance(99.99, 100), 0.01);
  assertEquals(stampVariance(null, 100), 100);
});
