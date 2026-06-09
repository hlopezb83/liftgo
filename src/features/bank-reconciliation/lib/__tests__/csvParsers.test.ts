import { describe, expect, it } from "vitest";
import { parseBankCsv } from "../csvParsers";

describe("parseBankCsv", () => {
  it("parsea perfil genérico con encabezados", () => {
    const csv = `Fecha,Descripcion,Monto,Referencia
05/05/2026,PAGO ACME,-1200.50,REF001
07/05/2026,DEPOSITO CLIENTE,3400.00,REF002`;
    const res = parseBankCsv(csv, "generico");
    expect(res.errors).toEqual([]);
    expect(res.lines).toHaveLength(2);
    expect(res.lines[0].posted_date).toBe("2026-05-05");
    expect(res.lines[0].signed_amount).toBe(-1200.5);
    expect(res.lines[1].signed_amount).toBe(3400);
    expect(res.periodStart).toBe("2026-05-05");
    expect(res.periodEnd).toBe("2026-05-07");
  });

  it("parsea BBVA con columnas cargo/abono", () => {
    const csv = `Fecha,Descripcion,Cargo,Abono,Ref
01-05-2026,COBRO CLIENTE,,5000.00,A1
02-05-2026,PAGO PROV,1500.00,,A2`;
    const res = parseBankCsv(csv, "bbva");
    expect(res.lines).toHaveLength(2);
    expect(res.lines[0].signed_amount).toBe(5000);
    expect(res.lines[1].signed_amount).toBe(-1500);
  });

  it("hash distingue líneas distintas y repite para idénticas", () => {
    const csv = `Fecha,Desc,Monto,Ref
05/05/2026,A,-100,R1
05/05/2026,A,-100,R1
05/05/2026,B,-100,R1`;
    const res = parseBankCsv(csv, "generico");
    expect(res.lines[0].hash).toBe(res.lines[1].hash);
    expect(res.lines[0].hash).not.toBe(res.lines[2].hash);
  });

  it("reporta errores en fechas inválidas", () => {
    const csv = `Fecha,Desc,Monto,Ref
no-valida,X,-100,R1`;
    const res = parseBankCsv(csv, "generico");
    expect(res.errors.length).toBeGreaterThan(0);
    expect(res.lines).toHaveLength(0);
  });
});
