import { describe, it, expect } from "vitest";
import { assignOccurrences, buildLine } from "../bankParseUtils";
import { parseBankCsv } from "../csvParsers";

/**
 * A5-09: el hash de deduplicación depende SOLO del contenido del movimiento
 * (fecha, importe, referencia, descripción). Dos movimientos legítimamente
 * idénticos se distinguen con `occurrence`, y la llave real es
 * `(bank_account_id, hash, occurrence)`. Así, reimportar el mismo estado de
 * cuenta —aunque las líneas vengan en otro orden o en un archivo traslapado—
 * vuelve a producir la misma llave y la BD descarta el duplicado.
 */
describe("bankParseUtils · hash de contenido + occurrence (A5-09)", () => {
  const base = {
    postedDate: "2026-08-20",
    description: "COMISION MENSUAL",
    signedAmount: -350,
    reference: null,
  };

  it("el índice de línea ya NO cambia el hash", async () => {
    const a = await buildLine({ ...base, lineSeq: 0 });
    const b = await buildLine({ ...base, lineSeq: 1 });
    expect(a.line_seq).toBe(0);
    expect(b.line_seq).toBe(1);
    expect(a.hash).toBe(b.hash);
  });

  it("un movimiento distinto sí cambia el hash", async () => {
    const a = await buildLine({ ...base, lineSeq: 0 });
    const b = await buildLine({ ...base, signedAmount: -351, lineSeq: 0 });
    expect(a.hash).not.toBe(b.hash);
  });

  it("assignOccurrences numera las repeticiones idénticas", async () => {
    const lines = await Promise.all([
      buildLine({ ...base, lineSeq: 1 }),
      buildLine({ ...base, lineSeq: 2 }),
      buildLine({ ...base, description: "OTRO", lineSeq: 3 }),
    ]);
    const withOcc = assignOccurrences(lines);
    expect(withOcc.map((l) => l.occurrence)).toEqual([1, 2, 1]);
  });

  it("el mismo movimiento en otro orden conserva hash y occurrence", async () => {
    const csvA = [
      "fecha,descripcion,monto,referencia",
      "2026-08-20,COMISION MENSUAL,-350.00,",
      "2026-08-21,DEPOSITO,1000.00,R9",
    ].join("\n");
    const csvB = [
      "fecha,descripcion,monto,referencia",
      "2026-08-21,DEPOSITO,1000.00,R9",
      "2026-08-20,COMISION MENSUAL,-350.00,",
    ].join("\n");
    const a = assignOccurrences((await parseBankCsv(csvA, "generico")).lines);
    const b = assignOccurrences((await parseBankCsv(csvB, "generico")).lines);
    const key = (l: { hash: string; occurrence: number }) => `${l.hash}#${l.occurrence}`;
    expect(a.map(key).sort()).toEqual(b.map(key).sort());
  });

  it("un CSV con dos movimientos idénticos comparte hash y difiere en occurrence", async () => {
    const csv = [
      "fecha,descripcion,monto,referencia",
      "2026-08-20,COMISION MENSUAL,-350.00,",
      "2026-08-20,COMISION MENSUAL,-350.00,",
    ].join("\n");
    const res = await parseBankCsv(csv, "generico");
    expect(res.errors).toEqual([]);
    expect(res.lines).toHaveLength(2);
    const withOcc = assignOccurrences(res.lines);
    expect(withOcc[0].hash).toBe(withOcc[1].hash);
    expect(withOcc.map((l) => l.occurrence)).toEqual([1, 2]);
    expect(res.lines.map((l) => l.line_seq)).toEqual([1, 2]);
  });
});
