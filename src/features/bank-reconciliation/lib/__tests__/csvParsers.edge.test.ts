import { describe, expect, it } from "vitest";
import { parseBankCsv } from "../csvParsers";

/**
 * Casos negativos y edge cases para parseBankCsv.
 * Riesgo: si se traga input malformado sin reportar errores, conciliación queda
 * con líneas fantasma o saldos inflados.
 */

describe("parseBankCsv — casos negativos y formatos alternos", () => {
  it("archivo completamente vacío devuelve error", () => {
    const res = parseBankCsv("", "generico");
    expect(res.lines).toHaveLength(0);
    expect(res.errors).toContain("El archivo está vacío");
    expect(res.periodStart).toBeNull();
    expect(res.periodEnd).toBeNull();
  });

  it("archivo con solo encabezado no produce líneas ni errores", () => {
    const res = parseBankCsv("Fecha,Desc,Monto,Ref", "generico");
    expect(res.lines).toHaveLength(0);
    expect(res.errors).toHaveLength(0);
  });

  it("monto cero se reporta como inválido", () => {
    const csv = `Fecha,Desc,Monto,Ref
05/05/2026,A,0,R1`;
    const res = parseBankCsv(csv, "generico");
    expect(res.lines).toHaveLength(0);
    expect(res.errors[0]).toMatch(/monto inválido o cero/);
  });

  it("monto con paréntesis se interpreta como negativo", () => {
    const csv = `Fecha,Desc,Monto,Ref
05/05/2026,A,(1234.56),R1`;
    const res = parseBankCsv(csv, "generico");
    expect(res.lines).toHaveLength(1);
    expect(res.lines[0].signed_amount).toBe(-1234.56);
  });

  it("acepta separador ';' y monto con símbolo $ y comas de miles", () => {
    const csv = `Fecha;Desc;Monto;Ref
05/05/2026;DEPOSITO;"$1,234.56";R1`;
    const res = parseBankCsv(csv, "generico");
    expect(res.lines).toHaveLength(1);
    expect(res.lines[0].signed_amount).toBe(1234.56);
  });

  it("fecha DD/MM/YY se expande a 20YY", () => {
    const csv = `Fecha,Desc,Monto,Ref
05/05/26,A,100,R1`;
    const res = parseBankCsv(csv, "generico");
    expect(res.lines[0].posted_date).toBe("2026-05-05");
  });

  it("BBVA: tanto cargo como abono presentes → credit - |charge|", () => {
    const csv = `Fecha,Desc,Cargo,Abono,Ref
05/05/2026,REVERSO,200,500,R1`;
    const res = parseBankCsv(csv, "bbva");
    expect(res.lines).toHaveLength(1);
    expect(res.lines[0].signed_amount).toBe(300);
  });

  it("mezcla válidas e inválidas: reporta error pero conserva las válidas", () => {
    const csv = `Fecha,Desc,Monto,Ref
05/05/2026,OK,100,R1
fecha-mala,X,200,R2
07/05/2026,OK2,-50,R3`;
    const res = parseBankCsv(csv, "generico");
    expect(res.lines).toHaveLength(2);
    expect(res.errors).toHaveLength(1);
    expect(res.periodStart).toBe("2026-05-05");
    expect(res.periodEnd).toBe("2026-05-07");
  });

  it("ignora líneas en blanco intermedias", () => {
    const csv = `Fecha,Desc,Monto,Ref
05/05/2026,A,100,R1

07/05/2026,B,200,R2`;
    const res = parseBankCsv(csv, "generico");
    expect(res.lines).toHaveLength(2);
    expect(res.errors).toHaveLength(0);
  });
});
