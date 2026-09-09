import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { creditNoteDiscountForSelection } from "./creditNoteDiscount.ts";

Deno.test("creditNoteDiscountForSelection prorratea descuento fijo en centavos", () => {
  assertEquals(creditNoteDiscountForSelection({
    originalGross: 1_000,
    selectedGross: 500,
    originalDiscount: 100,
    discountType: "$",
  }), 50);
  assertEquals(creditNoteDiscountForSelection({
    originalGross: 999,
    selectedGross: 333,
    originalDiscount: 100,
    discountType: "$",
  }), 33.33);
});

Deno.test("creditNoteDiscountForSelection conserva descuentos porcentuales", () => {
  assertEquals(creditNoteDiscountForSelection({
    originalGross: 1_000,
    selectedGross: 500,
    originalDiscount: 16,
    discountType: "%",
  }), 16);
});
