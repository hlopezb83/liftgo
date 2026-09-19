import { describe, expect, it } from "vitest";
import {
  assertEmisorMatchesSupplier,
  assertPagoMatchesInvoice,
  decodeRepXml,
  extractRepUuid,
  MAX_BASE64_CHARS,
  validateRepInput,
  type RepGuards,
} from "../supplierRep.validation";

class TestHttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const g = {
  HttpError: TestHttpError,
  isUUID: (v: unknown): v is string =>
    typeof v === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v),
} as unknown as RepGuards;

const PAYMENT_ID = "11111111-1111-1111-1111-111111111111";
const BILL_UUID = "22222222-2222-2222-2222-222222222222";
const REP_UUID = "33333333-3333-3333-3333-333333333333";

const toB64 = (s: string) => Buffer.from(s, "utf-8").toString("base64");

const REP_XML =
  `<?xml version="1.0" encoding="UTF-8"?><cfdi:Comprobante TipoDeComprobante="P">` +
  `<cfdi:Emisor Rfc="AAA010101AAA"/>` +
  `<cfdi:Complemento><tfd:TimbreFiscalDigital UUID="${REP_UUID}"/>` +
  `<pago20:Pagos><pago20:Pago Monto="1160.00">` +
  `<pago20:DoctoRelacionado IdDocumento="${BILL_UUID}"/>` +
  `</pago20:Pago></pago20:Pagos></cfdi:Complemento></cfdi:Comprobante>`;

const expectStatus = (fn: () => void, status: number, message?: RegExp) => {
  try {
    fn();
  } catch (e) {
    expect((e as TestHttpError).status).toBe(status);
    if (message) expect((e as Error).message).toMatch(message);
    return;
  }
  throw new Error("no lanzó error");
};

describe("validateRepInput", () => {
  it("acepta una entrada válida", () => {
    expect(() =>
      validateRepInput(g, { payment_id: PAYMENT_ID, xml_base64: toB64(REP_XML) })
    ).not.toThrow();
  });

  it("rechaza payment_id inválido (400)", () => {
    expectStatus(
      () => validateRepInput(g, { payment_id: "x", xml_base64: "abc" }),
      400,
      /payment_id inválido/,
    );
  });

  it("exige xml_base64 (400)", () => {
    expectStatus(
      () => validateRepInput(g, { payment_id: PAYMENT_ID, xml_base64: "" }),
      400,
      /xml_base64 es obligatorio/,
    );
  });

  it("rechaza XML y PDF que exceden 5MB (413)", () => {
    const big = "a".repeat(MAX_BASE64_CHARS + 1);
    expectStatus(
      () => validateRepInput(g, { payment_id: PAYMENT_ID, xml_base64: big }),
      413,
      /XML excede/,
    );
    expectStatus(
      () =>
        validateRepInput(g, {
          payment_id: PAYMENT_ID,
          xml_base64: toB64(REP_XML),
          pdf_base64: big,
        }),
      413,
      /PDF excede/,
    );
  });
});

describe("decodeRepXml", () => {
  it("devuelve el XML del complemento de pago", () => {
    expect(decodeRepXml(g, toB64(REP_XML))).toContain("TipoDeComprobante=\"P\"");
  });

  it("rechaza XML malformado", () => {
    expectStatus(
      () => decodeRepXml(g, toB64("<a><b></a>")),
      400,
      /XML malformado/,
    );
  });

  it("rechaza comprobantes que no son de tipo P", () => {
    expectStatus(
      () => decodeRepXml(g, toB64(REP_XML.replace('TipoDeComprobante="P"', 'TipoDeComprobante="I"'))),
      400,
      /no es un Complemento de Pago/,
    );
  });
});

describe("assertEmisorMatchesSupplier", () => {
  it("acepta el RFC del proveedor sin importar mayúsculas ni espacios", () => {
    expect(() =>
      assertEmisorMatchesSupplier(g, REP_XML, { rfc: " aaa010101aaa " })
    ).not.toThrow();
  });

  it("exige RFC capturado en el proveedor", () => {
    expectStatus(
      () => assertEmisorMatchesSupplier(g, REP_XML, { rfc: null }),
      400,
      /no tiene RFC capturado/,
    );
  });

  it("rechaza emisor distinto", () => {
    expectStatus(
      () => assertEmisorMatchesSupplier(g, REP_XML, { rfc: "BBB010101BBB" }),
      400,
      /no coincide con el proveedor/,
    );
  });
});

describe("assertPagoMatchesInvoice", () => {
  it("acepta el pago que referencia la factura por el monto esperado", () => {
    expect(() => assertPagoMatchesInvoice(g, REP_XML, BILL_UUID, 1160)).not.toThrow();
  });

  it("detecta monto distinto", () => {
    expectStatus(
      () => assertPagoMatchesInvoice(g, REP_XML, BILL_UUID, 999),
      400,
      /el monto no coincide/,
    );
  });

  it("detecta que el REP no incluye la factura", () => {
    expectStatus(
      () =>
        assertPagoMatchesInvoice(
          g,
          REP_XML,
          "44444444-4444-4444-4444-444444444444",
          1160,
        ),
      400,
      /no incluye la factura/,
    );
  });
});

describe("extractRepUuid", () => {
  it("lee el UUID del TimbreFiscalDigital", () => {
    expect(extractRepUuid(g, REP_XML)).toBe(REP_UUID);
  });

  it("rechaza REP sin timbre válido", () => {
    expectStatus(
      () => extractRepUuid(g, REP_XML.replace(REP_UUID, "no-uuid")),
      400,
      /TimbreFiscalDigital/,
    );
  });
});
