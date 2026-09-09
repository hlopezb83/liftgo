import { describe, expect, it } from "vitest";
import { creditNoteDiscountForSelection } from "../creditNoteDiscount";

describe("creditNoteDiscountForSelection", () => {
  it("prorratea un descuento fijo al acreditar media línea", () => {
    expect(creditNoteDiscountForSelection({
      originalGross: 1_000,
      selectedGross: 500,
      originalDiscount: 100,
      discountType: "$",
    })).toBe(50);
  });

  it("redondea la asignación proporcional en centavos", () => {
    expect(creditNoteDiscountForSelection({
      originalGross: 999,
      selectedGross: 333,
      originalDiscount: 100,
      discountType: "$",
    })).toBe(33.33);
  });

  it("conserva el porcentaje y limita descuentos fijos a la selección", () => {
    expect(creditNoteDiscountForSelection({
      originalGross: 1_000,
      selectedGross: 500,
      originalDiscount: 10,
      discountType: "%",
    })).toBe(10);
    expect(creditNoteDiscountForSelection({
      originalGross: 100,
      selectedGross: 25,
      originalDiscount: 500,
      discountType: "$",
    })).toBe(25);
  });
});
