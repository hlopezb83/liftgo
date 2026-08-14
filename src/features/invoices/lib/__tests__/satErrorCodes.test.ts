import { describe, it, expect } from "vitest";
import { classifyFacturapiError } from "../facturapiErrors";
import { normalizeCfdiErrorText } from "../formatStoredCfdiError";

describe("códigos numéricos del SAT", () => {
  it("301 → XML mal formado", () => {
    const r = classifyFacturapiError("code: 301 - El XML no cumple con el estándar");
    expect(r.code).toBe("SAT-301");
    expect(r.kind).toBe("xml");
    expect(r.message).toMatch(/mal formado/i);
  });

  it("402 → RFC no inscrito en el padrón", () => {
    const r = classifyFacturapiError("Error 402: RFC no inscrito en el padrón");
    expect(r.code).toBe("SAT-402");
    expect(r.kind).toBe("padron");
    expect(r.message).toMatch(/padrón del SAT/i);
  });

  it("304 → certificado revocado o caduco", () => {
    expect(classifyFacturapiError("código 304").code).toBe("SAT-304");
  });

  it("307 → CFDI duplicado", () => {
    const r = classifyFacturapiError("código de error: 307");
    expect(r.kind).toBe("duplicate");
  });

  it("404 del PAC se interpreta como sin timbres", () => {
    expect(classifyFacturapiError("error 404").kind).toBe("credits");
  });

  it("no confunde montos con códigos SAT", () => {
    const r = classifyFacturapiError("El total de 301 pesos no cuadra con los conceptos");
    expect(r.kind).toBe("unknown");
  });

  it("los CFDI40xxx siguen ganando sobre los numéricos", () => {
    const r = classifyFacturapiError("CFDI40148: DomicilioFiscalReceptor inválido (301)");
    expect(r.code).toBe("CFDI40148");
  });
});

describe("payload íntegro para soporte", () => {
  it("el mensaje del toast se resume pero raw conserva todo", () => {
    const long = `x${"y".repeat(400)}`;
    const r = classifyFacturapiError(long);
    expect(r.message.length).toBeLessThanOrEqual(201);
    expect(r.raw).toBe(long);
  });

  it("raw conserva el texto original incluso con código reconocido", () => {
    const raw = "code: 402 - RFC AAA010101AAA no inscrito";
    expect(classifyFacturapiError(raw).raw).toBe(raw);
  });

  it("normalizeCfdiErrorText aplana el JSON de Facturapi", () => {
    const payload = JSON.stringify({
      code: "invoice_stamping_failed",
      errors: [{ code: "CFDI40148", message: "CP inválido" }],
    });
    expect(normalizeCfdiErrorText(payload)).toBe("CFDI40148: CP inválido");
  });

  it("normalizeCfdiErrorText devuelve cadena vacía para nulos", () => {
    expect(normalizeCfdiErrorText(null)).toBe("");
    expect(normalizeCfdiErrorText("   ")).toBe("");
  });
});
