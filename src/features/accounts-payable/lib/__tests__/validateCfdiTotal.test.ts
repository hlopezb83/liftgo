import { describe, expect, it } from "vitest";
import { parseCfdiXml } from "../parseCfdiXml";
import { validateCfdiTotal } from "../validateCfdiTotal";

function xml({ subtotal = "100", total = "100", discount = "0", taxes = "0", iva = "0", isr = "0", currency = "MXN" } = {}) {
  return `<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" TipoDeComprobante="I"
    Moneda="${currency}" TipoCambio="20" SubTotal="${subtotal}" Descuento="${discount}" Total="${total}">
    <cfdi:Impuestos TotalImpuestosTrasladados="${taxes}"><cfdi:Retenciones>
    <cfdi:Retencion Impuesto="002" Importe="${iva}"/><cfdi:Retencion Impuesto="001" Importe="${isr}"/>
    </cfdi:Retenciones></cfdi:Impuestos></cfdi:Comprobante>`;
}

describe("validateCfdiTotal", () => {
  it("rechaza el caso auditado: XML de 105 cuyos campos producen 100", () => {
    expect(() => validateCfdiTotal(parseCfdiXml(xml({ total: "105" })))).toThrow("105.00 MXN");
    expect(() => validateCfdiTotal(parseCfdiXml(xml({ total: "105" })))).toThrow("100.00 MXN");
  });

  it.each(["MXN", "USD"])("concilia descuentos y retenciones en %s sin aplicar tipo de cambio", (currency) => {
    expect(() => validateCfdiTotal(parseCfdiXml(xml({ currency, subtotal: "1000", discount: "100", taxes: "144", iva: "96", isr: "12", total: "936" })))).not.toThrow();
  });

  it.each([
    { subtotal: "0.1", taxes: "0.2", total: "0.30" },
    { subtotal: "10.005", total: "10.01" },
    { subtotal: "0", total: "0" },
  ])("usa el mismo redondeo del formulario: $total", (values) => {
    expect(() => validateCfdiTotal(parseCfdiXml(xml(values)))).not.toThrow();
  });

  it("rechaza incluso un centavo de diferencia", () => {
    expect(() => validateCfdiTotal(parseCfdiXml(xml({ total: "100.01" })))).toThrow("no coincide");
  });
});
