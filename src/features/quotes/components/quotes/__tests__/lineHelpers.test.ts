import { describe, it, expect } from "vitest";
import { computeRentalLineTotal } from "../rentalLineHelpers";
import { computeSaleLineTotal } from "../saleLineHelpers";
import { saleLineTotal, applyDiscountToBase } from "@/lib/domain/invoiceHelpers";
import type { RentalLine } from "../RentalLineItems";
import type { SaleLine } from "../SaleLineItems";


const baseRental: RentalLine = {
  modelId: "m1", quantity: 1,
  dailyRate: 1000, weeklyRate: 5000, monthlyRate: 18000,
  discount: 0, discountType: "%",
};

describe("computeRentalLineTotal", () => {
  it("retorna 0 cuando faltan fechas", () => {
    expect(computeRentalLineTotal(baseRental)).toBe(0);
    expect(computeRentalLineTotal(baseRental, new Date("2026-01-01"))).toBe(0);
  });

  it("multiplica por quantity", () => {
    const start = new Date("2026-01-01"); const end = new Date("2026-01-31");
    const one = computeRentalLineTotal({ ...baseRental, quantity: 1 }, start, end);
    const three = computeRentalLineTotal({ ...baseRental, quantity: 3 }, start, end);
    expect(three).toBeCloseTo(one * 3, 2);
  });

  it("aplica descuento porcentual", () => {
    const start = new Date("2026-01-01"); const end = new Date("2026-01-31");
    const base = computeRentalLineTotal(baseRental, start, end);
    const dis = computeRentalLineTotal({ ...baseRental, discount: 10, discountType: "%" }, start, end);
    expect(dis).toBeCloseTo(base * 0.9, 2);
  });

  it("aplica descuento monto fijo y nunca devuelve negativo", () => {
    const start = new Date("2026-01-01"); const end = new Date("2026-01-31");
    const base = computeRentalLineTotal(baseRental, start, end);
    expect(computeRentalLineTotal({ ...baseRental, discount: 100, discountType: "$" }, start, end))
      .toBeCloseTo(base - 100, 2);
    expect(computeRentalLineTotal({ ...baseRental, discount: 9_999_999, discountType: "$" }, start, end))
      .toBe(0);
  });
});

describe("computeSaleLineTotal", () => {
  const base: SaleLine = { modelId: "m1", quantity: 2, unitPrice: 500, discount: 0, discountType: "%" };

  it("calcula qty * precio sin descuento", () => {
    expect(computeSaleLineTotal(base)).toBe(1000);
  });

  it("aplica descuento porcentual", () => {
    expect(computeSaleLineTotal({ ...base, discount: 25 })).toBe(750);
  });

  it("aplica descuento monto fijo y clamp ≥ 0", () => {
    expect(computeSaleLineTotal({ ...base, discount: 200, discountType: "$" })).toBe(800);
    expect(computeSaleLineTotal({ ...base, discount: 99999, discountType: "$" })).toBe(0);
  });

  it("ignora descuento ≤ 0", () => {
    expect(computeSaleLineTotal({ ...base, discount: 0, discountType: "%" })).toBe(1000);
    expect(computeSaleLineTotal({ ...base, discount: -5, discountType: "%" })).toBe(1000);
  });
});

describe("saleLineTotal & applyDiscountToBase (drift)", () => {
  it("3 × 19.99 sin drift", () => {
    expect(saleLineTotal({ quantity: 3, unit_price: 19.99 })).toBe(59.97);
  });
  it("descuento 10% sobre 19.99 sin drift", () => {
    expect(saleLineTotal({ quantity: 1, unit_price: 19.99, discount: 10, discount_type: "%" })).toBe(17.99);
  });
  it("descuento porcentual evita drift binario", () => {
    // 0.1 + 0.2 = 0.30000000000000004 → currency.js lo cuantiza a 0.3
    expect(applyDiscountToBase(0.1 + 0.2, 50, "%")).toBe(0.15);
  });
  it("descuento $ mayor que base devuelve 0", () => {
    expect(applyDiscountToBase(100, 9999, "$")).toBe(0);
  });
  it("valores no finitos en base devuelven 0", () => {
    expect(applyDiscountToBase(Number.NaN, 10, "%")).toBe(0);
  });
});
