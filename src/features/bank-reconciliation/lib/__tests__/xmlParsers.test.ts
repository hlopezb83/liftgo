import { describe, expect, it } from "vitest";
import { parseBankCsv } from "../csvParsers";
import { parseBankXml } from "../xmlParsers";

const CFDI_ECB = `<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/3" xmlns:ecb="http://www.sat.gob.mx/ecb">
  <cfdi:Complemento>
    <ecb:EstadoDeCuentaBancario numeroCuenta="1234567890">
      <ecb:Movimiento fecha="2026-07-01" concepto="SPEI RECIBIDO ACME" deposito="1500.50" retiro="0.00" referencia="0012345"/>
      <ecb:Movimiento fecha="2026-07-05" concepto="PAGO PROVEEDOR" deposito="0.00" retiro="800.00" referencia="0012346"/>
    </ecb:EstadoDeCuentaBancario>
  </cfdi:Complemento>
</cfdi:Comprobante>`;

const NETCASH = `<?xml version="1.0"?>
<EstadoCuenta>
  <Movimientos>
    <Movimiento>
      <FechaOperacion>2026-07-10T00:00:00</FechaOperacion>
      <Descripcion>TRASPASO ENTRE CUENTAS</Descripcion>
      <Importe>2,300.00</Importe>
      <Tipo>CARGO</Tipo>
      <Referencia>REF-99</Referencia>
    </Movimiento>
    <Movimiento>
      <FechaOperacion>2026-07-11T00:00:00</FechaOperacion>
      <Descripcion>DEPOSITO EFECTIVO</Descripcion>
      <Importe>500.00</Importe>
      <Tipo>ABONO</Tipo>
      <Referencia>REF-100</Referencia>
    </Movimiento>
  </Movimientos>
</EstadoCuenta>`;

describe("parseBankXml", () => {
  it("lee el complemento CFDI ecb con prefijos de namespace", () => {
    const r = parseBankXml(CFDI_ECB);
    expect(r.errors).toHaveLength(0);
    expect(r.lines).toHaveLength(2);
    expect(r.lines[0]).toMatchObject({ posted_date: "2026-07-01", signed_amount: 1500.5, reference: "0012345" });
    expect(r.lines[1].signed_amount).toBe(-800);
    expect(r.periodStart).toBe("2026-07-01");
    expect(r.periodEnd).toBe("2026-07-05");
  });

  it("usa el campo Tipo para dar signo a un importe único y acepta fecha con hora", () => {
    const r = parseBankXml(NETCASH);
    expect(r.lines).toHaveLength(2);
    expect(r.lines[0]).toMatchObject({ posted_date: "2026-07-10", signed_amount: -2300 });
    expect(r.lines[1].signed_amount).toBe(500);
  });

  it("detecta el mapeo y expone los campos disponibles", () => {
    const r = parseBankXml(CFDI_ECB);
    expect(r.detectedMapping).toMatchObject({ date: "fecha", description: "concepto", credit: "deposito", charge: "retiro" });
    expect(r.availableFields).toContain("referencia");
  });

  it("permite sobreescribir el mapeo manualmente", () => {
    const xml = `<root><m f1="2026-07-02" f2="COBRO" f3="100.00"/><m f1="2026-07-03" f2="COBRO 2" f3="200.00"/></root>`;
    const auto = parseBankXml(xml);
    expect(auto.lines).toHaveLength(0);
    expect(auto.errors.length).toBeGreaterThan(0);
    const manual = parseBankXml(xml, { date: "f1", description: "f2", amount: "f3" });
    expect(manual.lines).toHaveLength(2);
    expect(manual.lines[0].description).toBe("COBRO");
  });

  it("reporta el movimiento inválido sin romper el resto", () => {
    const xml = `<root>
      <mov fecha="2026-07-01" concepto="OK" importe="100"/>
      <mov fecha="no-fecha" concepto="MALA" importe="50"/>
      <mov fecha="2026-07-04" concepto="CERO" importe="0"/>
    </root>`;
    const r = parseBankXml(xml);
    expect(r.lines).toHaveLength(1);
    expect(r.errors).toHaveLength(2);
  });

  it("maneja XML mal formado y XML sin movimientos", () => {
    expect(parseBankXml("<root><a>").lines).toHaveLength(0);
    expect(parseBankXml("<root><solo fecha='2026-07-01'/></root>").errors[0]).toMatch(/movimientos/i);
  });

  it("genera el mismo hash que el CSV para el mismo movimiento", () => {
    const xml = `<root>
      <mov fecha="2026-07-01" concepto="SPEI RECIBIDO ACME" deposito="1500.50" retiro="0.00" referencia="0012345"/>
      <mov fecha="2026-07-02" concepto="OTRO" deposito="10.00" retiro="0.00" referencia="X"/>
    </root>`;
    const csv = "01/07/2026,SPEI RECIBIDO ACME,0.00,1500.50,0012345\n02/07/2026,OTRO,0.00,10.00,X";
    const fromXml = parseBankXml(xml).lines[0];
    const fromCsv = parseBankCsv(csv, "bbva").lines[0];
    expect(fromXml.hash).toBe(fromCsv.hash);
  });
});
