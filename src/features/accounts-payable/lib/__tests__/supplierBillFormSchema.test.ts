import { describe, expect, it } from "vitest";
import { supplierBillFormSchema } from "../../hooks/useSupplierBillForm";

const base = {
  supplier_id: "sup-1",
  category: "renta",
  description: "",
  issue_date: new Date(2026, 0, 15),
  currency: "MXN" as const,
  exchange_rate: 1,
  subtotal: 1000,
  tax_amount: 160,
  retention_iva: 0,
  retention_isr: 0,
  cfdi_uuid: "",
};

describe("supplierBillFormSchema (UX-M2)", () => {
  it("acepta payload mínimo válido", () => {
    const r = supplierBillFormSchema.safeParse(base);
    expect(r.success).toBe(true);
  });

  it("rechaza supplier_id vacío", () => {
    const r = supplierBillFormSchema.safeParse({ ...base, supplier_id: "" });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path.join(".") === "supplier_id")).toBe(true);
    }
  });

  it("rechaza category vacía", () => {
    const r = supplierBillFormSchema.safeParse({ ...base, category: "" });
    expect(r.success).toBe(false);
  });

  it("rechaza subtotal negativo", () => {
    const r = supplierBillFormSchema.safeParse({ ...base, subtotal: -1 });
    expect(r.success).toBe(false);
  });

  it("rechaza exchange_rate <= 0", () => {
    const r = supplierBillFormSchema.safeParse({ ...base, exchange_rate: 0 });
    expect(r.success).toBe(false);
  });

  it("acepta USD con exchange_rate > 1", () => {
    const r = supplierBillFormSchema.safeParse({ ...base, currency: "USD", exchange_rate: 18.5 });
    expect(r.success).toBe(true);
  });

  it("rechaza cobertura parcial (start sin end)", () => {
    const r = supplierBillFormSchema.safeParse({
      ...base,
      coverage_start: new Date(2026, 0, 1),
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path.includes("coverage_end"))).toBe(true);
    }
  });

  it("rechaza cobertura end < start", () => {
    const r = supplierBillFormSchema.safeParse({
      ...base,
      coverage_start: new Date(2026, 0, 10),
      coverage_end: new Date(2026, 0, 5),
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path.includes("coverage_end"))).toBe(true);
    }
  });

  it("acepta cobertura válida start <= end", () => {
    const r = supplierBillFormSchema.safeParse({
      ...base,
      coverage_start: new Date(2026, 0, 1),
      coverage_end: new Date(2026, 0, 31),
    });
    expect(r.success).toBe(true);
  });

  it("acepta payment_method_sat PUE/PPD y rechaza otros", () => {
    expect(supplierBillFormSchema.safeParse({ ...base, payment_method_sat: "PUE" }).success).toBe(true);
    expect(supplierBillFormSchema.safeParse({ ...base, payment_method_sat: "PPD" }).success).toBe(true);
    expect(
      supplierBillFormSchema.safeParse({ ...base, payment_method_sat: "XXX" as unknown as "PUE" }).success,
    ).toBe(false);
  });
});
