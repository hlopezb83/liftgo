import { describe, it, expect } from "vitest";
import { buildLine } from "../bankParseUtils";
import { parseBankCsv } from "../csvParsers";

/**
 * N-23: el hash de deduplicación incluye el índice de la línea dentro del
 * archivo. Dos movimientos idénticos (mismo día, mismo importe, sin
 * referencia) ya no colisionan y dejan de descartarse en silencio en el
 * upsert con `onConflict (bank_account_id, hash)`.
 */
describe("bankParseUtils · hash de deduplicación con line_seq (N-23)", () => {
  const base = {
    postedDate: "2026-08-20",
    description: "COMISION MENSUAL",
    signedAmount: -350,
    reference: null,
  };

  it("dos líneas idénticas con distinto índice producen hashes distintos", async () => {
    const a = await buildLine({ ...base, lineSeq: 0 });
    const b = await buildLine({ ...base, lineSeq: 1 });
    expect(a.line_seq).toBe(0);
    expect(b.line_seq).toBe(1);
    expect(a.hash).not.toBe(b.hash);
  });

  it("la misma línea en la misma posición conserva el hash (dedup de reimportación)", async () => {
    const a = await buildLine({ ...base, lineSeq: 3 });
    const b = await buildLine({ ...base, lineSeq: 3 });
    expect(a.hash).toBe(b.hash);
  });

  it("un CSV con dos movimientos idénticos genera dos hashes y dos índices", async () => {
    const csv = [
      "fecha,descripcion,monto,referencia",
      "2026-08-20,COMISION MENSUAL,-350.00,",
      "2026-08-20,COMISION MENSUAL,-350.00,",
    ].join("\n");
    const res = await parseBankCsv(csv, "generico");
    expect(res.errors).toEqual([]);
    expect(res.lines).toHaveLength(2);
    expect(res.lines[0].hash).not.toBe(res.lines[1].hash);
    expect(res.lines.map((l) => l.line_seq)).toEqual([1, 2]);
  });
});
