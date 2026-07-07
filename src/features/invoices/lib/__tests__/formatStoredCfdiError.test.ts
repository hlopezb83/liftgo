import { describe, it, expect } from "vitest";
import { formatStoredCfdiError } from "../formatStoredCfdiError";

describe("formatStoredCfdiError", () => {
  it("payload real de Facturapi con errors[] extrae CFDI40148", () => {
    const raw = JSON.stringify({
      code: "invoice_stamping_failed",
      message: "Validación de timbrado: El campo DomicilioFiscalReceptor del receptor, debe pertenecer al nombre asociado al RFC registrado en el campo Rfc del Receptor.",
      errors: [
        {
          code: "CFDI40148",
          message: "El campo DomicilioFiscalReceptor del receptor, debe pertenecer al nombre asociado al RFC registrado en el campo Rfc del Receptor.",
          path: "customer.address.zip",
          source: "pac",
        },
      ],
      logId: "6a4c4f693c49adca98a74ab6",
    });
    const out = formatStoredCfdiError(raw);
    expect(out).toMatch(/código postal/i);
    expect(out).not.toMatch(/\{"code"/);
  });

  it("JSON sin errors[] pero con code CFDI40147", () => {
    const raw = JSON.stringify({ code: "CFDI40147", message: "nombre inválido" });
    expect(formatStoredCfdiError(raw)).toMatch(/razón social/i);
  });

  it("string plano cae en el classifier (csd)", () => {
    expect(formatStoredCfdiError("certificate expired")).toMatch(/CSD|certificado/i);
  });

  it("null → null", () => {
    expect(formatStoredCfdiError(null)).toBeNull();
  });

  it("string vacío → null", () => {
    expect(formatStoredCfdiError("   ")).toBeNull();
  });

  it("JSON malformado usa el string original como fallback", () => {
    const out = formatStoredCfdiError("{no es json válido");
    expect(out).toBe("{no es json válido");
  });

});
