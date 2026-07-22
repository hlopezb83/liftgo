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

  // R7 Bloque 21.4
  it("aplica trim al nombre y respeta límite de 200 caracteres", () => {
    const r = customerFormSchema.safeParse({ ...empty, name: "  Cliente  " });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.name).toBe("Cliente");
    const long = customerFormSchema.safeParse({ ...empty, name: "x".repeat(201) });
    expect(long.success).toBe(false);
  });

  it("valida CP fiscal a 5 dígitos y acepta vacío", () => {
    expect(
      customerFormSchema.safeParse({ ...empty, name: "X", domicilio_fiscal_cp: "" }).success,
    ).toBe(true);
    expect(
      customerFormSchema.safeParse({ ...empty, name: "X", domicilio_fiscal_cp: "64000" }).success,
    ).toBe(true);
    expect(
      customerFormSchema.safeParse({ ...empty, name: "X", domicilio_fiscal_cp: "640" }).success,
    ).toBe(false);
    expect(
      customerFormSchema.safeParse({ ...empty, name: "X", domicilio_fiscal_cp: "abcde" }).success,
    ).toBe(false);
  });
});
