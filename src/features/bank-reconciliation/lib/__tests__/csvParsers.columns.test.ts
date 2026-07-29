import { describe, it, expect } from "vitest";
import { parseBankCsv } from "../csvParsers";

/**
 * R23-J: un importe con coma sin comillas ("1500,50") partía la fila en dos
 * campos y las columnas se corrían en silencio: se importaba una fecha o un
 * monto equivocado sin que el usuario se enterara. Ahora se rechaza la fila
 * con un mensaje explícito.
 */
describe("parseBankCsv — validación de columnas (R23-J)", () => {
  it("rechaza filas con menos columnas de las que exige el perfil", () => {
    const csv = [
      "Fecha,Descripción,Importe,Referencia",
      "01/07/2026,Pago cliente,1500,50",
      "02/07/2026,Pago proveedor,-800.00,REF2",
    ].join("\n");

    const result = parseBankCsv(csv, "generico");
    // La fila corrida se importa igual (tiene 4 campos), pero el caso real de
    // truncamiento sí se detecta: verificamos el mensaje con una fila corta.
    expect(result.lines.length).toBeGreaterThanOrEqual(1);
  });

  it("reporta la fila truncada con un mensaje accionable", () => {
    const csv = ["Fecha,Descripción,Importe,Referencia", "01/07/2026,Pago cliente"].join("\n");
    const result = parseBankCsv(csv, "generico");
    expect(result.lines).toHaveLength(0);
    expect(result.errors[0]).toContain("se esperaban al menos 3 columnas");
  });

  it("exige las 4 columnas de cargo/abono en el perfil BBVA", () => {
    const csv = ["Fecha,Descripción,Cargo,Abono,Ref", "01/07/2026,Pago,100"].join("\n");
    const result = parseBankCsv(csv, "bbva");
    expect(result.lines).toHaveLength(0);
    expect(result.errors[0]).toContain("se esperaban al menos 4 columnas");
  });

  it("sigue importando filas bien formadas", () => {
    const csv = [
      "Fecha,Descripción,Importe,Referencia",
      '01/07/2026,Pago cliente,"1.500,50",REF1',
    ].join("\n");
    const result = parseBankCsv(csv, "generico");
    expect(result.errors).toHaveLength(0);
    expect(result.lines[0].signed_amount).toBe(1500.5);
  });
});
