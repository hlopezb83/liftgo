import { describe, it, expect } from "vitest";
import { classifyFacturapiError } from "../facturapiErrors";

describe("classifyFacturapiError", () => {
  it("CFDI40148 → apunta al código postal", () => {
    const r = classifyFacturapiError("CFDI40148: campo inválido");
    expect(r.kind).toBe("receptor_data");
    expect(r.message).toMatch(/código postal/i);
  });

  it("mensaje literal DomicilioFiscalReceptor cae en CFDI40148 (CP)", () => {
    const raw =
      "invoice_stamping_failed: Validación de timbrado: El campo DomicilioFiscalReceptor del receptor, debe pertenecer al nombre asociado al RFC registrado en el campo Rfc del Receptor.";
    const r = classifyFacturapiError(raw);
    expect(r.kind).toBe("receptor_data");
    expect(r.message).toMatch(/código postal/i);
  });

  it("CFDI40147 → apunta a la razón social", () => {
    const r = classifyFacturapiError("CFDI40147: nombre inválido");
    expect(r.kind).toBe("receptor_data");
    expect(r.message).toMatch(/razón social/i);
  });

  it("error de CSD sigue clasificándose como csd", () => {
    const r = classifyFacturapiError("certificate expired");
    expect(r.kind).toBe("csd");
  });

  it("error desconocido cae en unknown", () => {
    const r = classifyFacturapiError("something weird happened");
    expect(r.kind).toBe("unknown");
  });
});
