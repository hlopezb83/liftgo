import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { repTaxBreakdown } from "./taxBreakdown.ts";

Deno.test("REP preserves original bases for mixed rates and partial payments", () => {
  const lines = [{ total: 100, tax_rate: 16 }, { total: 100, tax_rate: 0 }];
  assertEquals(repTaxBreakdown(lines, 16, 216)?.map((t) => t.base), [100, 100]);
  assertEquals(repTaxBreakdown(lines, 16, 108)?.map((t) => t.base), [50, 50]);
  assertEquals(
    repTaxBreakdown([{ total: 100, tax_rate: 16 }], 16, 116)?.[0].base,
    100,
  );
});
Deno.test("REP applies fixed/percentage discounts, zero and non-object independently", () => {
  const lines = [
    { total: 100, discount: 10, discount_type: "$" as const, tax_rate: 16 },
    { total: 100, discount: 10, tax_rate: 8 },
    { total: 100, tax_rate: 0 },
    { total: 100, objeto_imp: "01" },
  ];
  const taxes = repTaxBreakdown(lines, 16, 401.6);
  assertEquals(taxes?.map((t) => [t.base, t.rate]), [[90, .16], [90, .08], [
    100,
    0,
  ]]);
  assertEquals(repTaxBreakdown(lines, 16, 200.8)?.map((t) => t.base), [
    45,
    45,
    50,
  ]);
  assertEquals(
    repTaxBreakdown([{ total: 100, objeto_imp: "01" }], 16, 100),
    [],
  );
});
Deno.test("REP rejects invalid source and overpayment before PAC", () => {
  for (const total of [NaN, Infinity, -1]) {
    assertEquals(repTaxBreakdown([{ total }], 16, 1), null);
  }
  assertEquals(repTaxBreakdown([], 16, 1), null);
  // Persisted JSON can violate the static line shape.
  assertEquals(repTaxBreakdown([null as never], 16, 1), null);
  assertEquals(repTaxBreakdown([{ total: .01 }], 16, .001), null);
  assertEquals(repTaxBreakdown([{ total: 100 }], 16, 117), null);
});
Deno.test("REP keeps cent rounding and rate groups independent of order", () => {
  const lines = [{ total: 0.03, tax_rate: 16 }, { total: 0.05, tax_rate: 0 }];
  assertEquals(repTaxBreakdown(lines, 16, .08)?.map((t) => t.base), [.03, .05]);
  assertEquals(
    repTaxBreakdown(lines.toReversed(), 16, .08)?.map((t) => t.base),
    [.05, .03],
  );
});
