import { describe, expect, it } from "vitest";
import {
  extractAllAttr,
  extractAttr,
  extractPagoNodes,
  isWellFormedXml,
} from "../supplierRepXml";

// L-8: chequeo estructural de XML bien formado antes del parseo por regex.
describe("isWellFormedXml", () => {
  it("acepta XML válido con declaración y namespaces", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?><cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" xmlns:pago20="http://www.sat.gob.mx/Pagos20" xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital" TipoDeComprobante="P"><cfdi:Emisor Rfc="AAA010101AAA"/><cfdi:Complemento><pago20:Pagos><pago20:Pago Monto="100.00"/></pago20:Pagos></cfdi:Complemento></cfdi:Comprobante>`;
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
  const xml = `<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" xmlns:pago20="http://www.sat.gob.mx/Pagos20" xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital" TipoDeComprobante="P"><cfdi:Emisor Rfc="AAA010101AAA"/><cfdi:Complemento><pago20:Pagos><pago20:Pago Monto="1160.00"><pago20:DoctoRelacionado IdDocumento="11111111-1111-1111-1111-111111111111"/><pago20:DoctoRelacionado IdDocumento="22222222-2222-2222-2222-222222222222"/></pago20:Pago></pago20:Pagos></cfdi:Complemento></cfdi:Comprobante>`;

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

describe("structural REP parsing regressions", () => {
  const root = (body: string, extra = "") =>
    `<c:Comprobante xmlns:c="http://www.sat.gob.mx/cfd/4" xmlns:p="http://www.sat.gob.mx/Pagos20" xmlns:t="http://www.sat.gob.mx/TimbreFiscalDigital" TipoDeComprobante='P' ${extra}>${body}</c:Comprobante>`;
  const payment = (amount: string, id: string) =>
    `<p:Pago Monto='${amount}'><p:DoctoRelacionado IdDocumento='${id}'/></p:Pago>`;

  it("accepts single quotes, alternate prefixes and escaped attributes", () => {
    const xml = root("<c:Emisor Rfc='AAA010101AAA' Nombre='A &amp; B'/>");
    expect(extractAttr(xml, "Comprobante", "TipoDeComprobante")).toBe("P");
    expect(extractAttr(xml, "Emisor", "Nombre")).toBe("A & B");
  });

  it.each([
    "<a/><b/>",
    "<a/><![CDATA[bad]]>",
    "<a>\u0000</a>",
    "<a x='\u0001'/>",
    "<a>&#0;</a>",
    "<a x='&#xD800;'/>",
    "<a>\uD800</a>",
    "<a broken=/>",
    "<a x='1' x='2'/>",
    "<a>&unknown;</a>",
    "<a>ok</a>trailing",
    "<unbound:a/>",
    "<a><b></a>",
    '<!DOCTYPE a SYSTEM "https://example.invalid/external"><a/>',
    '<!DOCTYPE a [<!ENTITY x "expanded">]><a>&x;</a>',
  ])("rejects malformed/unsafe XML: %s", (xml) => {
    expect(isWellFormedXml(xml)).toBe(false);
    expect(extractAttr(xml, "Comprobante", "TipoDeComprobante")).toBeNull();
    expect(extractPagoNodes(xml)).toEqual([]);
  });

  it("never substitutes a namespaced lookalike for an unnamespaced fiscal attribute", () => {
    const xml = root(
      "<c:Emisor xmlns:other='urn:other' Rfc='REAL' other:Rfc='FAKE'/>",
    );
    expect(extractAttr(xml, "Emisor", "Rfc")).toBe("REAL");
    expect(
      extractAttr(
        root("<c:Emisor xmlns:other='urn:other' other:Rfc='FAKE'/>"),
        "Emisor",
        "Rfc",
      ),
    ).toBeNull();
    expect(
      extractAttr(root("<c:Emisor Rfc='REAL' Rfc='FAKE'/>"), "Emisor", "Rfc"),
    ).toBeNull();
  });

  it("does not extract apparent tags from comments or CDATA", () => {
    const xml = root(
      "<!-- <c:Emisor Rfc='FAKE'/> --><![CDATA[<c:Emisor Rfc='FAKE'/>]]><c:Emisor Rfc='REAL'/>",
    );
    expect(extractAttr(xml, "Emisor", "Rfc")).toBe("REAL");
  });

  it("does not accept wrong namespaces, wrapped roots or nested emitters", () => {
    expect(
      extractAttr(
        root("<c:Emisor Rfc='BAD'/>").replace(
          "http://www.sat.gob.mx/cfd/4",
          "urn:fake",
        ),
        "Emisor",
        "Rfc",
      ),
    ).toBeNull();
    expect(
      extractAttr(
        `<wrapper>${root("<c:Emisor Rfc='BAD'/>")}</wrapper>`,
        "Comprobante",
        "TipoDeComprobante",
      ),
    ).toBeNull();
    expect(
      extractAttr(
        root("<wrapper><c:Emisor Rfc='BAD'/></wrapper>"),
        "Emisor",
        "Rfc",
      ),
    ).toBeNull();
    expect(
      extractAttr(
        root("<c:Emisor Rfc='A'/><c:Emisor Rfc='B'/>"),
        "Emisor",
        "Rfc",
      ),
    ).toBeNull();
  });

  it("keeps each payment amount paired with only its direct related documents", () => {
    const xml = root(
      `<c:Complemento><p:Pagos>${payment("10", "A")}${payment("20", "B")}</p:Pagos></c:Complemento>`,
    );
    expect(extractPagoNodes(xml)).toEqual([
      { monto: 10, doctos: ["A"] },
      { monto: 20, doctos: ["B"] },
    ]);
  });

  it("ignores payment lookalikes outside the proper complement and namespace", () => {
    expect(extractPagoNodes(root(payment("99", "BAD")))).toEqual([]);
    const xml = root(
      `<c:Complemento><p:Pagos>${payment("99", "BAD")}</p:Pagos></c:Complemento>`,
    ).replace("http://www.sat.gob.mx/Pagos20", "urn:fake");
    expect(extractPagoNodes(xml)).toEqual([]);
  });

  it("reads the timbre only under the direct CFDI complement and rejects ambiguity", () => {
    const timbre = "<t:TimbreFiscalDigital UUID='REAL'/>";
    expect(
      extractAttr(
        root(`<c:Complemento>${timbre}</c:Complemento>`),
        "TimbreFiscalDigital",
        "UUID",
      ),
    ).toBe("REAL");
    expect(extractAttr(root(timbre), "TimbreFiscalDigital", "UUID")).toBeNull();
    expect(
      extractAttr(
        root(`<c:Complemento>${timbre}${timbre}</c:Complemento>`),
        "TimbreFiscalDigital",
        "UUID",
      ),
    ).toBeNull();
  });

  it("bounds UTF-8 bytes, depth and markup before extracting data", () => {
    expect(isWellFormedXml(`<a>${"é".repeat(3 * 1024 * 1024)}</a>`)).toBe(
      false,
    );
    expect(isWellFormedXml("<a>".repeat(65) + "</a>".repeat(65))).toBe(false);
    expect(isWellFormedXml("<a>" + "<b/>".repeat(50_001) + "</a>")).toBe(false);
    expect(isWellFormedXml("<a>".repeat(64) + "</a>".repeat(64))).toBe(true);
  });
});
