import { describe, it, expect } from "vitest";
import { quoteFormSchema } from "../quoteFormSchema";

const baseRental = {
  quoteType: "rental" as const,
  customerId: "cust-1",
  customerName: "Cliente Uno",
  currency: "MXN" as const,
  taxRate: "16",
  notes: "",
  includeLogistics: false,
  logisticsCost: 0,
  dateRange: { from: new Date("2026-02-01"), to: new Date("2026-02-28") },
  rentalLines: [
    { modelId: "mod-1", quantity: 1, dailyRate: 0, weeklyRate: 0, monthlyRate: 15000, discount: 0, discountType: "%" as const },
  ],
  saleLines: [],
};

const baseSale = {
  ...baseRental,
  quoteType: "sale" as const,
  dateRange: undefined,
  rentalLines: [],
  saleLines: [
    { modelId: "mod-1", quantity: 1, unitPrice: 250000, discount: 0, discountType: "%" as const },
  ],
};

describe("quoteFormSchema", () => {
  it("acepta una cotización de renta válida (mensual)", () => {
    expect(quoteFormSchema.safeParse(baseRental).success).toBe(true);
  });

  it("acepta renta con sólo dailyRate > 0", () => {
    const r = quoteFormSchema.safeParse({
      ...baseRental,
      rentalLines: [{ ...baseRental.rentalLines[0], monthlyRate: 0, dailyRate: 500 }],
    });
    expect(r.success).toBe(true);
  });

  it("acepta renta con sólo weeklyRate > 0", () => {
    const r = quoteFormSchema.safeParse({
      ...baseRental,
      rentalLines: [{ ...baseRental.rentalLines[0], monthlyRate: 0, weeklyRate: 3000 }],
    });
    expect(r.success).toBe(true);
  });

  it("rechaza partida de renta con todas las tarifas en 0", () => {
    const r = quoteFormSchema.safeParse({
      ...baseRental,
      rentalLines: [{ ...baseRental.rentalLines[0], dailyRate: 0, weeklyRate: 0, monthlyRate: 0 }],
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some(i => i.message.includes("al menos una tarifa"))).toBe(true);
    }
  });

  it("acepta una cotización de venta válida", () => {
    expect(quoteFormSchema.safeParse(baseSale).success).toBe(true);
  });

  it("rechaza sin customerId", () => {
    const r = quoteFormSchema.safeParse({ ...baseRental, customerId: "" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues.some(i => i.path.join(".") === "customerId")).toBe(true);
  });

  it("rechaza renta sin partidas", () => {
    const r = quoteFormSchema.safeParse({ ...baseRental, rentalLines: [] });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues.some(i => i.path.join(".") === "rentalLines")).toBe(true);
  });

  it("rechaza venta sin partidas", () => {
    const r = quoteFormSchema.safeParse({ ...baseSale, saleLines: [] });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues.some(i => i.path.join(".") === "saleLines")).toBe(true);
  });

  it("rechaza partida de renta sin modelo", () => {
    const r = quoteFormSchema.safeParse({
      ...baseRental,
      rentalLines: [{ ...baseRental.rentalLines[0], modelId: "" }],
    });
    expect(r.success).toBe(false);
  });

  it("rechaza renta con end_date < start_date", () => {
    const r = quoteFormSchema.safeParse({
      ...baseRental,
      dateRange: { from: new Date("2026-03-15"), to: new Date("2026-03-01") },
    });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues.some(i => i.path.join(".") === "dateRange")).toBe(true);
  });

  it("rechaza renta sin dateRange", () => {
    const r = quoteFormSchema.safeParse({ ...baseRental, dateRange: undefined });
    expect(r.success).toBe(false);
  });

  it("rechaza partida de venta con unitPrice <= 0", () => {
    const r = quoteFormSchema.safeParse({
      ...baseSale,
      saleLines: [{ ...baseSale.saleLines[0], unitPrice: 0 }],
    });
    expect(r.success).toBe(false);
  });

  it("rechaza taxRate inválido", () => {
    const r = quoteFormSchema.safeParse({ ...baseRental, taxRate: "abc" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues.some(i => i.path.join(".") === "taxRate")).toBe(true);
  });

  it("rechaza logística marcada sin costo", () => {
    const r = quoteFormSchema.safeParse({ ...baseRental, includeLogistics: true, logisticsCost: 0 });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues.some(i => i.path.join(".") === "logisticsCost")).toBe(true);
  });

  it("acepta logística con costo válido", () => {
    const r = quoteFormSchema.safeParse({ ...baseRental, includeLogistics: true, logisticsCost: 5000 });
    expect(r.success).toBe(true);
  });

  it("acepta logisticsCost > 0 cuando includeLogistics=false (no bloquea)", () => {
    const r = quoteFormSchema.safeParse({ ...baseRental, includeLogistics: false, logisticsCost: 999 });
    expect(r.success).toBe(true);
  });
});

describe("quoteFormSchema · descuentos %", () => {
  // R7 Bloque 21.6
  it("rechaza descuento % > 100 en renta", () => {
    const r = quoteFormSchema.safeParse({
      ...baseRental,
      rentalLines: [{ ...baseRental.rentalLines[0], discount: 150, discountType: "%" as const }],
    });
    expect(r.success).toBe(false);
  });

  it("acepta descuento $ > 100 (importe absoluto) en renta", () => {
    const r = quoteFormSchema.safeParse({
      ...baseRental,
      rentalLines: [{ ...baseRental.rentalLines[0], discount: 500, discountType: "$" as const }],
    });
    expect(r.success).toBe(true);
  });

  it("rechaza descuento % > 100 en venta", () => {
    const r = quoteFormSchema.safeParse({
      ...baseSale,
      saleLines: [{ ...baseSale.saleLines[0], discount: 101, discountType: "%" as const }],
    });
    expect(r.success).toBe(false);
  });
});
