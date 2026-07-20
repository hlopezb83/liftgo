import { describe, expect, it } from "vitest";
import { buildSupplierPayload, supplierToFormData } from "../supplierFormPayload";
import { emptySupplierFormData } from "../supplierFormSchema";

describe("buildSupplierPayload", () => {
  it("trims name y devuelve nulls para strings vacíos", () => {
    const p = buildSupplierPayload({ ...emptySupplierFormData, name: "  ACME  " });
    expect(p.name).toBe("ACME");
    expect(p.contact_person).toBeNull();
    expect(p.email).toBeNull();
    expect(p.rfc).toBeNull();
    expect(p.default_payment_terms_days).toBeNull();
  });

  it("uppercases RFC y trimea espacios", () => {
    const p = buildSupplierPayload({
      ...emptySupplierFormData,
      name: "ACME",
      rfc: "  xaxx010101000  ",
    });
    expect(p.rfc).toBe("XAXX010101000");
  });

  it("convierte default_payment_terms_days a número", () => {
    const p = buildSupplierPayload({
      ...emptySupplierFormData,
      name: "ACME",
      default_payment_terms_days: "30",
    });
    expect(p.default_payment_terms_days).toBe(30);
  });

  it("preserva valores no-vacíos con trim", () => {
    const p = buildSupplierPayload({
      ...emptySupplierFormData,
      name: "ACME",
      email: "  hola@acme.com  ",
      phone: "555",
      notes: "  nota ",
    });
    expect(p.email).toBe("hola@acme.com");
    expect(p.phone).toBe("555");
    expect(p.notes).toBe("nota");
  });
});

describe("supplierToFormData", () => {
  it("mapea nulls a strings vacíos", () => {
    const d = supplierToFormData({
      name: "ACME",
      email: null,
      phone: null,
      rfc: null,
      default_payment_terms_days: null,
    });
    expect(d.email).toBe("");
    expect(d.phone).toBe("");
    expect(d.rfc).toBe("");
    expect(d.default_payment_terms_days).toBe("");
  });

  it("serializa default_payment_terms_days numérico a string", () => {
    const d = supplierToFormData({ name: "ACME", default_payment_terms_days: 45 });
    expect(d.default_payment_terms_days).toBe("45");
  });
});
