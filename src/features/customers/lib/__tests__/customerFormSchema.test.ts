import { describe, expect, it } from "vitest";
import { customerFormSchema } from "../customerFormSchema";

const empty = {
  name: "", email: "", phone: "", address: "", notes: "",
  website: "", contact_person: "",
  rfc: "", regimen_fiscal: "", uso_cfdi: "", domicilio_fiscal_cp: "",
  representante_legal: "",
};

describe("customerFormSchema", () => {
  it("acepta payload mínimo válido con solo nombre", () => {
    const r = customerFormSchema.safeParse({ ...empty, name: "Cliente X" });
    expect(r.success).toBe(true);
  });

  it("rechaza nombre vacío", () => {
    const r = customerFormSchema.safeParse({ ...empty, name: "" });
    expect(r.success).toBe(false);
  });

  it("acepta email vacío u opcional válido", () => {
    expect(customerFormSchema.safeParse({ ...empty, name: "X", email: "" }).success).toBe(true);
    expect(
      customerFormSchema.safeParse({ ...empty, name: "X", email: "a@b.com" }).success,
    ).toBe(true);
  });

  it("rechaza email malformado", () => {
    const r = customerFormSchema.safeParse({ ...empty, name: "X", email: "no-email" });
    expect(r.success).toBe(false);
  });

  it("acepta RFC opcional vacío y válido", () => {
    expect(customerFormSchema.safeParse({ ...empty, name: "X", rfc: "" }).success).toBe(true);
    expect(
      customerFormSchema.safeParse({ ...empty, name: "X", rfc: "XAXX010101000" }).success,
    ).toBe(true);
  });
});
