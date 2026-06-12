import { describe, it, expect } from "vitest";
import { getMissingStampFields } from "../cfdiPrechecks";
import type { Tables } from "@/integrations/supabase/types";

type Invoice = Tables<"invoices">;

// Construye un Invoice mínimo — solo tipa los 7 campos inspeccionados;
// el resto se rellena con cast loose para evitar arrastre del schema completo.
function makeInvoice(over: Partial<Invoice>): Invoice {
  const base: Partial<Invoice> = {
    receptor_rfc: null,
    receptor_razon_social: null,
    receptor_regimen_fiscal: null,
    receptor_domicilio_fiscal_cp: null,
    uso_cfdi: null,
    forma_pago: null,
    metodo_pago: null,
  };
  return { ...base, ...over } as Invoice;
}

describe("getMissingStampFields", () => {
  it("factura completa → array vacío", () => {
    const invoice = makeInvoice({
      receptor_rfc: "AAA010101AAA",
      receptor_razon_social: "Empresa SA de CV",
      receptor_regimen_fiscal: "601",
      receptor_domicilio_fiscal_cp: "06600",
      uso_cfdi: "G03",
      forma_pago: "03",
      metodo_pago: "PUE",
    });
    expect(getMissingStampFields(invoice)).toEqual([]);
  });

  it("RFC null + CP vacío → reporta ambos", () => {
    const invoice = makeInvoice({
      receptor_rfc: null,
      receptor_razon_social: "Empresa SA",
      receptor_regimen_fiscal: "601",
      receptor_domicilio_fiscal_cp: "",
      uso_cfdi: "G03",
      forma_pago: "03",
      metodo_pago: "PUE",
    });
    const missing = getMissingStampFields(invoice);
    expect(missing).toHaveLength(2);
    expect(missing).toContain("RFC del receptor");
    expect(missing).toContain("Código postal del receptor");
  });

  it("Público en general (XAXX010101000) pasa cuando todo está completo", () => {
    const invoice = makeInvoice({
      receptor_rfc: "XAXX010101000",
      receptor_razon_social: "PUBLICO EN GENERAL",
      receptor_regimen_fiscal: "616",
      receptor_domicilio_fiscal_cp: "06600",
      uso_cfdi: "S01",
      forma_pago: "99",
      metodo_pago: "PUE",
    });
    expect(getMissingStampFields(invoice)).toEqual([]);
  });

  it("todos los campos null → reporta los 7 labels", () => {
    const invoice = makeInvoice({});
    expect(getMissingStampFields(invoice)).toHaveLength(7);
  });

  it("RFC con solo espacios → cuenta como faltante", () => {
    const invoice = makeInvoice({
      receptor_rfc: "   ",
      receptor_razon_social: "Empresa SA",
      receptor_regimen_fiscal: "601",
      receptor_domicilio_fiscal_cp: "06600",
      uso_cfdi: "G03",
      forma_pago: "03",
      metodo_pago: "PUE",
    });
    expect(getMissingStampFields(invoice)).toContain("RFC del receptor");
  });
});
