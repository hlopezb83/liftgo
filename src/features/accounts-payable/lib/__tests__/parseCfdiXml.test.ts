import { describe, it, expect } from "vitest";
import { parseCfdiXml, CfdiParseError } from "../parseCfdiXml";

const XML_DOBLE_NIVEL = `<?xml version="1.0" encoding="utf-8"?>
<cfdi:Comprobante Version="4.0" Fecha="2026-06-17T11:36:49" FormaPago="03"
  SubTotal="10000.00" Moneda="MXN" Total="10408.00" TipoDeComprobante="I"
  Exportacion="01" MetodoPago="PUE" LugarExpedicion="66036"
  xmlns:cfdi="http://www.sat.gob.mx/cfd/4">
  <cfdi:Emisor Rfc="RAGM860406QQ5" Nombre="MELISSA RAMIREZ GARCIA" RegimenFiscal="626" />
  <cfdi:Receptor Rfc="HEN200317227" Nombre="HERREN ENERGY" DomicilioFiscalReceptor="66367" RegimenFiscalReceptor="601" UsoCFDI="G03" />
  <cfdi:Conceptos>
    <cfdi:Concepto ClaveProdServ="82101603" Cantidad="1" ClaveUnidad="E48" Descripcion="Asesoría Digital" ValorUnitario="10000.00" Importe="10000.000000" ObjetoImp="02">
      <cfdi:Impuestos>
        <cfdi:Traslados>
          <cfdi:Traslado Base="10000.000000" Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.160000" Importe="1600.000000" />
        </cfdi:Traslados>
        <cfdi:Retenciones>
          <cfdi:Retencion Base="10000.000000" Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.106667" Importe="1067.000000" />
          <cfdi:Retencion Base="10000.000000" Impuesto="001" TipoFactor="Tasa" TasaOCuota="0.012500" Importe="125.000000" />
        </cfdi:Retenciones>
      </cfdi:Impuestos>
    </cfdi:Concepto>
  </cfdi:Conceptos>
  <cfdi:Impuestos TotalImpuestosTrasladados="1600.00" TotalImpuestosRetenidos="1192.00">
    <cfdi:Retenciones>
      <cfdi:Retencion Impuesto="002" Importe="1067.00" />
      <cfdi:Retencion Impuesto="001" Importe="125.00" />
    </cfdi:Retenciones>
    <cfdi:Traslados>
      <cfdi:Traslado Base="10000.00" Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.160000" Importe="1600.00" />
    </cfdi:Traslados>
  </cfdi:Impuestos>
  <cfdi:Complemento>
    <tfd:TimbreFiscalDigital xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital" Version="1.1" UUID="755B91B5-FC10-4B30-A651-58EFF3300D28" FechaTimbrado="2026-06-17T11:37:02" RfcProvCertif="SAT970701NN3" SelloCFD="x" NoCertificadoSAT="00001000000705250068" SelloSAT="y" />
  </cfdi:Complemento>
</cfdi:Comprobante>`;

const XML_SIN_IMPUESTOS = `<?xml version="1.0" encoding="utf-8"?>
<cfdi:Comprobante Version="4.0" Fecha="2026-01-15T10:00:00"
  SubTotal="500.00" Moneda="MXN" Total="500.00" TipoDeComprobante="I"
  Exportacion="01" MetodoPago="PUE" LugarExpedicion="66036"
  xmlns:cfdi="http://www.sat.gob.mx/cfd/4">
  <cfdi:Emisor Rfc="XAXX010101000" Nombre="EXENTO" RegimenFiscal="616" />
  <cfdi:Receptor Rfc="HEN200317227" Nombre="HERREN" DomicilioFiscalReceptor="66367" RegimenFiscalReceptor="601" UsoCFDI="G03" />
  <cfdi:Conceptos>
    <cfdi:Concepto ClaveProdServ="01010101" Cantidad="1" ClaveUnidad="E48" Descripcion="Exento" ValorUnitario="500.00" Importe="500.00" ObjetoImp="01" />
  </cfdi:Conceptos>
  <cfdi:Complemento>
    <tfd:TimbreFiscalDigital xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital" Version="1.1" UUID="aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" FechaTimbrado="2026-01-15T10:00:10" RfcProvCertif="SAT970701NN3" SelloCFD="x" NoCertificadoSAT="0" SelloSAT="y" />
  </cfdi:Complemento>
</cfdi:Comprobante>`;

describe("parseCfdiXml", () => {
  it("no duplica impuestos cuando vienen a nivel concepto y a nivel comprobante", () => {
    const parsed = parseCfdiXml(XML_DOBLE_NIVEL);
    expect(parsed.subtotal).toBe(10000);
    expect(parsed.total).toBe(10408);
    expect(parsed.taxAmount).toBe(1600);
    expect(parsed.retentionIva).toBe(1067);
    expect(parsed.retentionIsr).toBe(125);
    expect(parsed.uuid).toBe("755B91B5-FC10-4B30-A651-58EFF3300D28");
    expect(parsed.emitterRfc).toBe("RAGM860406QQ5");
    expect(parsed.receiverRfc).toBe("HEN200317227");
    expect(parsed.currency).toBe("MXN");
    expect(parsed.paymentMethodSat).toBe("PUE");
  });

  it("devuelve impuestos en 0 cuando el CFDI no trae nodo Impuestos", () => {
    const parsed = parseCfdiXml(XML_SIN_IMPUESTOS);
    expect(parsed.subtotal).toBe(500);
    expect(parsed.total).toBe(500);
    expect(parsed.taxAmount).toBe(0);
    expect(parsed.retentionIva).toBe(0);
    expect(parsed.retentionIsr).toBe(0);
  });

  it("lanza CfdiParseError si no es un Comprobante", () => {
    expect(() => parseCfdiXml("<foo/>")).toThrow(CfdiParseError);
  });
});
