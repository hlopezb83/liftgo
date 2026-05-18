import { describe, it, expect } from "vitest";
import { calculateRentalCost, computeTotals } from "@/lib/domain/invoiceUtils";
import { parseDateLocal, formatDateDisplay } from "@/lib/utils";

describe("calculateRentalCost", () => {
  it("counts 2 calendar months from Jan 1 to Feb 28 (inclusive)", () => {
    const items = calculateRentalCost(50, 300, 1000, new Date("2025-01-01"), new Date("2025-02-28"));
    expect(items[0].description).toBe("Renta mensual");
    expect(items[0].quantity).toBe(2);
    expect(items[0].total).toBe(2000);
    expect(items).toHaveLength(1); // no remainder
  });

  it("counts 1 month + remainder for Feb 1 to Mar 15", () => {
    const items = calculateRentalCost(50, 300, 1000, new Date("2025-02-01"), new Date("2025-03-15"));
    expect(items[0].description).toBe("Renta mensual");
    expect(items[0].quantity).toBe(1);
    // Mar 1 to Mar 15 = 15 days remainder
    expect(items[1].description).toBe("Renta semanal");
    expect(items[1].quantity).toBe(2);
    expect(items[2].description).toBe("Renta diaria");
    expect(items[2].quantity).toBe(1);
  });

  it("uses weekly rate for 7+ remaining days", () => {
    // Jan 1 to Jan 10 inclusive = 10 days → 1 week + 3 days
    const items = calculateRentalCost(50, 300, 0, new Date("2025-01-01"), new Date("2025-01-10"));
    expect(items).toHaveLength(2);
    expect(items[0].description).toBe("Renta semanal");
    expect(items[0].quantity).toBe(1);
    expect(items[1].description).toBe("Renta diaria");
    expect(items[1].quantity).toBe(3);
  });

  it("uses daily rate for short periods", () => {
    const items = calculateRentalCost(50, 300, 1000, new Date("2025-01-01"), new Date("2025-01-03"));
    expect(items).toHaveLength(1);
    expect(items[0].description).toBe("Renta diaria");
    expect(items[0].quantity).toBe(3);
    expect(items[0].total).toBe(150);
  });

  it("returns empty for zero rates", () => {
    const items = calculateRentalCost(0, 0, 0, new Date("2025-01-01"), new Date("2025-01-05"));
    expect(items).toHaveLength(0);
  });

  it("falls back to weekly/7 when no daily rate", () => {
    const items = calculateRentalCost(0, 700, 0, new Date("2025-01-01"), new Date("2025-01-03"));
    expect(items).toHaveLength(1);
    expect(items[0].unit_price).toBe(100);
  });

  it("handles February correctly (28 days = 1 month)", () => {
    const items = calculateRentalCost(50, 300, 1000, new Date("2025-02-01"), new Date("2025-02-28"));
    expect(items[0].quantity).toBe(1);
    expect(items[0].total).toBe(1000);
    expect(items).toHaveLength(1);
  });

  it("handles 31-day month correctly", () => {
    const items = calculateRentalCost(50, 300, 1000, new Date("2025-01-01"), new Date("2025-01-31"));
    expect(items[0].quantity).toBe(1);
    expect(items[0].total).toBe(1000);
    expect(items).toHaveLength(1);
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

describe("parseDateLocal", () => {
  it("parses 2025-10-20 as day 20 (no UTC shift)", () => {
    const d = parseDateLocal("2025-10-20");
    expect(d.getFullYear()).toBe(2025);
    expect(d.getMonth()).toBe(9); // October = 9
    expect(d.getDate()).toBe(20);
  });

  it("parses 2025-11-20 as day 20", () => {
    const d = parseDateLocal("2025-11-20");
    expect(d.getDate()).toBe(20);
  });

  it("handles date with timestamp suffix", () => {
    const d = parseDateLocal("2025-10-20T00:00:00.000Z");
    expect(d.getDate()).toBe(20);
  });
});

describe("formatDateDisplay", () => {
  it("displays 2025-10-20 as 20/10/2025", () => {
    expect(formatDateDisplay("2025-10-20")).toBe("20/10/2025");
  });

  it("returns dash for null", () => {
    expect(formatDateDisplay(null)).toBe("—");
  });
});
