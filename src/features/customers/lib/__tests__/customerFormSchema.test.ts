import { describe, it, expect } from "vitest";
import { customerFormSchema } from "@/features/customers/lib/customerFormSchema";

describe("customerFormSchema", () => {
  it("acepta payload mínimo válido", () => {
    const r = customerFormSchema.safeParse({ name: "Cliente Demo" });
    expect(r.success).toBe(true);
  });

  it("rechaza nombre vacío", () => {
    const r = customerFormSchema.safeParse({ name: "" });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.message === "El nombre es requerido")).toBe(true);
    }
  });

  it("acepta email vacío (campo opcional)", () => {
    const r = customerFormSchema.safeParse({ name: "A", email: "" });
    expect(r.success).toBe(true);
  });

  it("rechaza email con formato inválido", () => {
    const r = customerFormSchema.safeParse({ name: "A", email: "no-es-email" });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.message.includes("inválido"))).toBe(true);
    }
  });

  it("acepta email válido", () => {
    const r = customerFormSchema.safeParse({ name: "A", email: "demo@liftgo.mx" });
    expect(r.success).toBe(true);
  });

  it("aplica defaults a campos CFDI cuando no se proveen", () => {
    const r = customerFormSchema.parse({ name: "X" });
    expect(r.rfc).toBe("");
    expect(r.razon_social).toBe("");
    expect(r.regimen_fiscal).toBe("");
    expect(r.uso_cfdi).toBe("");
    expect(r.domicilio_fiscal_cp).toBe("");
  });
});
