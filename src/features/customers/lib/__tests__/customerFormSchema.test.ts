import { describe, it, expect } from "vitest";
import { customerFormSchema } from "../customerFormSchema";

/**
 * Validación Zod del formulario de clientes.
 * Riesgo: aceptar email malformado o nombre vacío rompe CFDI 4.0 y reportes.
 */

const base = {
  name: "Acme S.A. de C.V.",
};

describe("customerFormSchema", () => {
  it("acepta payload mínimo con solo name; el resto cae a defaults vacíos", () => {
    const parsed = customerFormSchema.parse(base);
    expect(parsed.name).toBe("Acme S.A. de C.V.");
    expect(parsed.email).toBe("");
    expect(parsed.phone).toBe("");
    expect(parsed.rfc).toBe("");
    expect(parsed.razon_social).toBe("");
  });

  it("rechaza name vacío con mensaje en español", () => {
    const res = customerFormSchema.safeParse({ ...base, name: "" });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues[0].message).toBe("El nombre es requerido");
    }
  });

  it("acepta email vacío (campo opcional)", () => {
    const res = customerFormSchema.safeParse({ ...base, email: "" });
    expect(res.success).toBe(true);
  });

  it("rechaza email con formato inválido", () => {
    const res = customerFormSchema.safeParse({ ...base, email: "no-es-email" });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues[0].message).toBe("Correo electrónico inválido");
    }
  });

  it("acepta email válido tipo persona@dominio.mx", () => {
    const res = customerFormSchema.safeParse({ ...base, email: "ventas@acme.com.mx" });
    expect(res.success).toBe(true);
  });

  it("preserva campos fiscales CFDI 4.0 cuando se proveen", () => {
    const parsed = customerFormSchema.parse({
      ...base,
      rfc: "XAXX010101000",
      razon_social: "ACME SA DE CV",
      regimen_fiscal: "601",
      uso_cfdi: "G03",
      domicilio_fiscal_cp: "64000",
    });
    expect(parsed.rfc).toBe("XAXX010101000");
    expect(parsed.domicilio_fiscal_cp).toBe("64000");
  });
});
