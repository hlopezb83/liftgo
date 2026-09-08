import { describe, expect, it } from "vitest";
import {
  extractAllAttr,
  extractAttr,
  extractPagoNodes,
  isWellFormedXml,
} from "../supplierRep.functions";

// L-8: chequeo estructural de XML bien formado antes del parseo por regex.
describe("isWellFormedXml", () => {
  it("acepta XML válido con declaración y namespaces", () => {
    const xml =
      `<?xml version="1.0" encoding="UTF-8"?><cfdi:Comprobante TipoDeComprobante="P"><cfdi:Emisor Rfc="AAA010101AAA"/><cfdi:Complemento><pago20:Pagos><pago20:Pago Monto="100.00"/></pago20:Pagos></cfdi:Complemento></cfdi:Comprobante>`;
    expect(isWellFormedXml(xml)).toBe(true);
  });

  it("rechaza XML truncado", () => {
    expect(
      isWellFormedXml(
        `<?xml version="1.0"?><cfdi:Comprobante><cfdi:Emisor Rfc="AAA010101AAA"/>`,
      ),
    ).toBe(false);
  });

  it("rechaza tags desbalanceados", () => {
    expect(isWellFormedXml(`<a><b></a></b>`)).toBe(false);
  });

  it("rechaza contenido que no es XML", () => {
    expect(isWellFormedXml("no soy xml")).toBe(false);
    expect(isWellFormedXml("")).toBe(false);
  });
});

describe("extracción de atributos CFDI", () => {
  const xml =
    `<cfdi:Comprobante TipoDeComprobante="P"><cfdi:Emisor Rfc="AAA010101AAA"/><pago20:Pago Monto="1160.00"><pago20:DoctoRelacionado IdDocumento="11111111-1111-1111-1111-111111111111"/><pago20:DoctoRelacionado IdDocumento="22222222-2222-2222-2222-222222222222"/></pago20:Pago></cfdi:Comprobante>`;

  it("lee atributos con prefijo de namespace", () => {
    expect(extractAttr(xml, "Comprobante", "TipoDeComprobante")).toBe("P");
    expect(extractAttr(xml, "Emisor", "Rfc")).toBe("AAA010101AAA");
  });

  it("lee todos los documentos relacionados", () => {
    expect(extractAllAttr(xml, "DoctoRelacionado", "IdDocumento")).toEqual([
      "11111111-1111-1111-1111-111111111111",
      "22222222-2222-2222-2222-222222222222",
    ]);
  });

  it("agrupa monto y documentos por nodo Pago", () => {
    const pagos = extractPagoNodes(xml);
    expect(pagos).toHaveLength(1);
    expect(pagos[0]!.monto).toBe(1160);
    expect(pagos[0]!.doctos).toHaveLength(2);
  });
});
