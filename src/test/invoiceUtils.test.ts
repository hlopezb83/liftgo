import { describe, it, expect } from "vitest";
import { calculateRentalCost, computeTotals } from "@/lib/invoiceUtils";

describe("calculateRentalCost", () => {
  it("uses monthly rate for 30+ days", () => {
    const items = calculateRentalCost(50, 300, 1000, 60);
    expect(items[0].description).toBe("Monthly rental");
    expect(items[0].quantity).toBe(2);
    expect(items[0].total).toBe(2000);
  });

  it("uses weekly rate for 7+ remaining days", () => {
    const items = calculateRentalCost(50, 300, 1000, 37);
    expect(items).toHaveLength(2); // 1 month + 1 week
    expect(items[1].description).toBe("Weekly rental");
    expect(items[1].quantity).toBe(1);
  });

  it("uses daily rate for remaining days", () => {
    const items = calculateRentalCost(50, 300, 1000, 3);
    expect(items).toHaveLength(1);
    expect(items[0].description).toBe("Daily rental");
    expect(items[0].quantity).toBe(3);
    expect(items[0].total).toBe(150);
  });

  it("returns empty for zero rates and zero days", () => {
    const items = calculateRentalCost(0, 0, 0, 5);
    expect(items).toHaveLength(0);
  });

  it("falls back to weekly/7 when no daily rate", () => {
    const items = calculateRentalCost(0, 700, 0, 3);
    expect(items).toHaveLength(1);
    expect(items[0].unit_price).toBe(100);
  });
});

describe("computeTotals", () => {
  it("computes subtotal, tax, and total correctly", () => {
    const items = [
      { description: "A", quantity: 1, unit_price: 100, total: 100 },
      { description: "B", quantity: 2, unit_price: 50, total: 100 },
    ];
    const result = computeTotals(items, 16);
    expect(result.subtotal).toBe(200);
    expect(result.taxAmount).toBe(32);
    expect(result.total).toBe(232);
  });

  it("handles zero tax rate", () => {
    const items = [{ description: "A", quantity: 1, unit_price: 100, total: 100 }];
    const result = computeTotals(items, 0);
    expect(result.taxAmount).toBe(0);
    expect(result.total).toBe(100);
  });

  it("handles empty line items", () => {
    const result = computeTotals([], 16);
    expect(result.subtotal).toBe(0);
    expect(result.total).toBe(0);
  });
});
