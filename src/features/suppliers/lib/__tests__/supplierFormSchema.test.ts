import { describe, expect, it } from "vitest";
import { supplierFormSchema, emptySupplierFormData } from "../supplierFormSchema";

describe("supplierFormSchema", () => {
  it("acepta payload mínimo válido con solo nombre", () => {
    const r = supplierFormSchema.safeParse({ ...emptySupplierFormData, name: "ACME" });
    expect(r.success).toBe(true);
  });

  it("rechaza nombre vacío", () => {
    const r = supplierFormSchema.safeParse({ ...emptySupplierFormData, name: "   " });
    expect(r.success).toBe(false);
  });

  it("acepta email vacío (opcional)", () => {
    const r = supplierFormSchema.safeParse({ ...emptySupplierFormData, name: "ACME", email: "" });
    expect(r.success).toBe(true);
  });

  it("rechaza email malformado", () => {
    const r = supplierFormSchema.safeParse({
      ...emptySupplierFormData,
      name: "ACME",
      email: "no-es-email",
    });
    expect(r.success).toBe(false);
  });

  it("acepta RFC vacío y RFC MX válido", () => {
    expect(
      supplierFormSchema.safeParse({ ...emptySupplierFormData, name: "ACME", rfc: "" }).success,
    ).toBe(true);
    expect(
      supplierFormSchema.safeParse({
        ...emptySupplierFormData,
        name: "ACME",
        rfc: "XAXX010101000",
      }).success,
    ).toBe(true);
  });

  it("acepta default_payment_terms_days en rango 0-365", () => {
    for (const v of ["", "0", "30", "365"]) {
      expect(
        supplierFormSchema.safeParse({
          ...emptySupplierFormData,
          name: "ACME",
          default_payment_terms_days: v,
        }).success,
      ).toBe(true);
    }
  });

  it("rechaza default_payment_terms_days fuera de rango o no numérico", () => {
    for (const v of ["-1", "366", "abc"]) {
      expect(
        supplierFormSchema.safeParse({
          ...emptySupplierFormData,
          name: "ACME",
          default_payment_terms_days: v,
        }).success,
      ).toBe(false);
    }
  });
  it("rechaza campos de texto que exceden su límite máximo", () => {
    const cases: Array<[keyof typeof emptySupplierFormData, number]> = [
      ["name", 200],
      ["contact_person", 200],
      ["phone", 40],
      ["website", 200],
      ["address", 500],
      ["notes", 2000],
    ];
    for (const [field, max] of cases) {
      const ok = supplierFormSchema.safeParse({
        ...emptySupplierFormData,
        name: "ACME",
        [field]: "a".repeat(max),
      });
      expect(ok.success, `${field} en el límite`).toBe(true);
      const bad = supplierFormSchema.safeParse({
        ...emptySupplierFormData,
        name: "ACME",
        [field]: "a".repeat(max + 1),
      });
      expect(bad.success, `${field} excedido`).toBe(false);
    }
  });
});
