// Unit tests for the pure CFDI 4.0 parser. No network, no Deno APIs beyond test runtime.
import {
  assertAlmostEquals,
  assertEquals,
  assertThrows,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { parseCfdi } from "./cfdi-parser.ts";

const FIXTURE_BASIC = `<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4"
  Version="4.0" Serie="A" Folio="123" Fecha="2026-03-15T10:30:00"
  SubTotal="1000.00" Total="1160.00" Moneda="MXN" TipoCambio="1"
  MetodoPago="PUE" TipoDeComprobante="I">
  <cfdi:Emisor Rfc="AAA010101AAA" Nombre="PROVEEDOR DEMO SA DE CV" RegimenFiscal="601"/>
  <cfdi:Receptor Rfc="HEN200317227" Nombre="LIFTGO SA DE CV"
    UsoCFDI="G03" DomicilioFiscalReceptor="64000" RegimenFiscalReceptor="601"/>
  <cfdi:Conceptos>
    <cfdi:Concepto ClaveProdServ="81111500" Descripcion="Servicio de consultoria"/>
  </cfdi:Conceptos>
  <cfdi:Impuestos TotalImpuestosTrasladados="160.00"/>
  <cfdi:Complemento>
    <tfd:TimbreFiscalDigital xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital"
      UUID="ABCDEF12-3456-7890-ABCD-EF1234567890"/>
  </cfdi:Complemento>
</cfdi:Comprobante>`;

const FIXTURE_RETENCIONES = `<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4"
  Version="4.0" Folio="999" Fecha="2026-04-01T12:00:00"
  SubTotal="10000.00" Total="9000.00" Moneda="USD" TipoCambio="20.50"
  MetodoPago="PPD">
  <cfdi:Emisor Rfc="BBB020202BBB" Nombre="ARRENDADORA X" RegimenFiscal="612"/>
  <cfdi:Conceptos>
    <cfdi:Concepto ClaveProdServ="80131500" Descripcion="Renta de oficina"/>
    <cfdi:Concepto ClaveProdServ="80131500" Descripcion="Cuotas mantenimiento"/>
  </cfdi:Conceptos>
  <cfdi:Impuestos TotalImpuestosTrasladados="1600.00" TotalImpuestosRetenidos="2600.00">
    <cfdi:Retenciones>
      <cfdi:Retencion Impuesto="002" Importe="1066.67"/>
      <cfdi:Retencion Impuesto="001" Importe="1533.33"/>
    </cfdi:Retenciones>
  </cfdi:Impuestos>
  <cfdi:Complemento>
    <tfd:TimbreFiscalDigital xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital"
      UUID="11111111-2222-3333-4444-555555555555"/>
  </cfdi:Complemento>
</cfdi:Comprobante>`;

Deno.test("parseCfdi: extrae campos basicos de un CFDI con IVA trasladado", () => {
  const r = parseCfdi(FIXTURE_BASIC);
  assertEquals(r.cfdi_uuid, "abcdef12-3456-7890-abcd-ef1234567890");
  assertEquals(r.serie, "A");
  assertEquals(r.folio, "123");
  assertEquals(r.fecha, "2026-03-15");
  assertEquals(r.subtotal, 1000);
  assertEquals(r.total, 1160);
  assertEquals(r.tax_amount, 160);
  assertEquals(r.retention_iva, 0);
  assertEquals(r.retention_isr, 0);
  assertEquals(r.moneda, "MXN");
  assertEquals(r.tipo_cambio, 1);
  assertEquals(r.payment_method_sat, "PUE");
  assertEquals(r.emisor.rfc, "AAA010101AAA");
  assertEquals(r.emisor.regimen_fiscal, "601");
  assertEquals(r.conceptos.length, 1);
  assertEquals(r.conceptos[0].clave_prod_serv, "81111500");
});

Deno.test("parseCfdi: distingue retenciones IVA (002) e ISR (001) y multi-concepto", () => {
  const r = parseCfdi(FIXTURE_RETENCIONES);
  assertEquals(r.moneda, "USD");
  assertEquals(r.tipo_cambio, 20.5);
  assertEquals(r.payment_method_sat, "PPD");
  assertEquals(r.tax_amount, 1600);
  assertAlmostEquals(r.retention_iva, 1066.67, 0.01);
  assertAlmostEquals(r.retention_isr, 1533.33, 0.01);
  assertEquals(r.conceptos.length, 2);
  assertEquals(r.emisor.regimen_fiscal, "612");
});

Deno.test("parseCfdi: UUID se normaliza a minusculas", () => {
  const r = parseCfdi(FIXTURE_BASIC);
  assertEquals(r.cfdi_uuid, r.cfdi_uuid.toLowerCase());
});

Deno.test("parseCfdi: lanza si falta nodo Comprobante", () => {
  assertThrows(
    () => parseCfdi("<xml><foo/></xml>"),
    Error,
    "Comprobante",
  );
});

Deno.test("parseCfdi: lanza si falta TimbreFiscalDigital (sin UUID)", () => {
  const noTimbre = FIXTURE_BASIC.replace(
    /<cfdi:Complemento>[\s\S]*<\/cfdi:Complemento>/,
    "",
  );
  assertThrows(() => parseCfdi(noTimbre), Error, "timbre");
});

Deno.test("parseCfdi: defaults seguros para campos opcionales", () => {
  const minimal = `<?xml version="1.0"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" Total="100" SubTotal="100" Fecha="2026-01-01T00:00:00">
  <cfdi:Complemento>
    <tfd:TimbreFiscalDigital xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital" UUID="00000000-0000-0000-0000-000000000001"/>
  </cfdi:Complemento>
</cfdi:Comprobante>`;
  const r = parseCfdi(minimal);
  assertEquals(r.moneda, "MXN");
  assertEquals(r.tipo_cambio, 1);
  assertEquals(r.payment_method_sat, "PUE");
  assertEquals(r.folio, "");
  assertEquals(r.serie, "");
  assertEquals(r.emisor.rfc, "");
  assertEquals(r.conceptos.length, 0);
});
