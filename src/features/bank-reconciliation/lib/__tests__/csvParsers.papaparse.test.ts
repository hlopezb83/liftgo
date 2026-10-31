import { describe, expect, it, vi } from "vitest";
import { parseBankCsv } from "../csvParsers";
import { assignOccurrences, BankStatementLineLimitError } from "../bankParseUtils";

const header = "Fecha,Descripcion,Monto,Referencia";

describe("parseBankCsv — logical CSV records", () => {
  it("preserves quoted multiline descriptions and doubled quotes", async () => {
    const result = await parseBankCsv(`${header}\n05/05/2026,"PAGO ""ACME""\nFACTURA 12",-100,000012`, "generico");
    expect(result.errors).toEqual([]);
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0]).toMatchObject({ description: 'PAGO "ACME"\nFACTURA 12', reference: "000012", signed_amount: -100 });
  });

  it("accepts BOM, CRLF, whitespace and trailing empty columns", async () => {
    const result = await parseBankCsv(`\uFEFF${header}\r\n\r\n05/05/2026, PAGO ,100, 000012 ,,\r\n   \r\n`, "generico");
    expect(result.errors).toEqual([]);
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0]).toMatchObject({ description: "PAGO", reference: "000012" });
  });

  it("uses one delimiter per file and keeps decimal commas in semicolon files", async () => {
    const result = await parseBankCsv("Fecha;Desc;Monto;Ref\n05/05/2026;PAGO, ACME;1500,50;0001", "generico");
    expect(result.errors).toEqual([]);
    expect(result.lines[0]).toMatchObject({ description: "PAGO, ACME", signed_amount: 1500.5, reference: "0001" });
  });

  it("does not split semicolons in comma-delimited descriptions", async () => {
    const result = await parseBankCsv(`${header}\n05/05/2026,PAGO; ACME,100,0001`, "generico");
    expect(result.errors).toEqual([]);
    expect(result.lines[0].description).toBe("PAGO; ACME");
  });

  it("rejects the whole file when valid movements use different delimiters", async () => {
    const result = await parseBankCsv(`${header}\n05/05/2026,OK,100,R1\n06/05/2026;BAD;200;R2`, "generico");
    expect(result.lines).toEqual([]);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("separador CSV");
  });

  it.each(['"unterminated', '"bad"suffix'])('rejects malformed quotes before hashing: %s', async (description) => {
    const digest = vi.spyOn(crypto.subtle, "digest");
    try {
      const result = await parseBankCsv(`${header}\n05/05/2026,OK,100,R1\n06/05/2026,${description},200,R2`, "generico");
      expect(result.lines).toEqual([]);
      expect(result.errors.join(" ")).toContain("CSV inválido");
      expect(result.periodStart).toBeNull();
      expect(result.periodEnd).toBeNull();
      expect(digest).not.toHaveBeenCalled();
    } finally { digest.mockRestore(); }
  });

  it("counts movements rather than physical lines and enforces the limit before hashing", async () => {
    const csv = `${header}\n05/05/2026,"ONE\nTWO",100,R1\n06/05/2026,SECOND,200,R2`;
    expect((await parseBankCsv(csv, "generico", 2)).lines).toHaveLength(2);
    const digest = vi.spyOn(crypto.subtle, "digest");
    try {
      await expect(parseBankCsv(csv, "generico", 1)).rejects.toBeInstanceOf(BankStatementLineLimitError);
      expect(digest).not.toHaveBeenCalled();
    } finally { digest.mockRestore(); }
  });

  it("keeps canonical hashes and duplicate occurrences stable across CSV encodings", async () => {
    const plain = await parseBankCsv(`${header}\n05/05/2026,ACME,100,0001\n05/05/2026,ACME,100,0001`, "generico");
    const quoted = await parseBankCsv('\uFEFFFecha;Desc;Monto;Ref\r\n"05/05/2026";"ACME";"100";"0001"\r\n05/05/2026;ACME;100;0001', "generico");
    expect(quoted.errors).toEqual([]);
    expect(assignOccurrences(quoted.lines)).toEqual(assignOccurrences(plain.lines));
    expect(assignOccurrences(quoted.lines).map((line) => line.occurrence)).toEqual([1, 2]);
  });

  it.each(["bbva", "banorte"] as const)("preserves %s charge/credit columns", async (profile) => {
    const result = await parseBankCsv('Fecha;Desc;Cargo;Abono;Ref\n05/05/2026;"ACME; CLIENTE";200;500;0001', profile);
    expect(result.errors).toEqual([]);
    expect(result.lines[0]).toMatchObject({ signed_amount: 300, reference: "0001" });
  });

  it("accepts headerless Santander records without losing the first movement", async () => {
    const result = await parseBankCsv('05/05/2026,"ACME",100,0001', "santander");
    expect(result.errors).toEqual([]);
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0].line_seq).toBe(0);
  });
});

describe("parseBankCsv — legacy padded quote compatibility", () => {
  it.each([",", ";"])("keeps all padded quoted fields canonical with %s", async (separator) => {
    const header = ["Fecha", "Desc", "Monto", "Ref"].join(separator);
    const canonical = ['"05/05/2026"', '"PAGO, ACME"', '"100"', '"0001"'].join(separator);
    const padded = ['  "05/05/2026"', ' \t"PAGO, ACME"', ' "100"', ' "0001"'].join(separator);
    const expected = await parseBankCsv(`${header}\n${canonical}`, "generico");
    expect(await parseBankCsv(`${header}\n${padded}`, "generico")).toEqual(expected);
    const headerless = await parseBankCsv(padded, "generico");
    expect(headerless.errors).toEqual([]);
    expect(headerless.lines).toHaveLength(1);
    expect(headerless.lines[0].hash).toBe(expected.lines[0].hash);
  });

  it("does not normalize delimiter-like text inside quoted descriptions", async () => {
    const result = await parseBankCsv(`${header}\n05/05/2026, "NOTE,  ""QUOTED""\n  ""NEXT""",100,0001`, "generico");
    expect(result.errors).toEqual([]);
    expect(result.lines[0].description).toBe('NOTE,  "QUOTED"\n  "NEXT"');
  });

  it("does not treat a semicolon as a field boundary in comma CSV", async () => {
    const result = await parseBankCsv(`${header}\n05/05/2026,PAGO;  "ACME",100,0001`, "generico");
    expect(result.errors).toEqual([]);
    expect(result.lines[0].description).toBe('PAGO;  "ACME"');
  });
});

it("detects headerless semicolon CSV despite commas inside a padded quote", async () => {
  const actual = await parseBankCsv('05/05/2026; "A,B,C,D,E";100;0001', "generico");
  const canonical = await parseBankCsv('05/05/2026;"A,B,C,D,E";100;0001', "generico");
  expect(actual.errors).toEqual([]);
  expect(actual.lines).toHaveLength(1);
  expect(actual).toEqual(canonical);
});

it("never selects a delimiter from a date-prefixed merged field", async () => {
  const actual = await parseBankCsv('05/05/2026; "A,100,200,R";999;0001', "generico");
  expect(actual.errors).toEqual([]);
  expect(actual.lines).toHaveLength(1);
  expect(actual.lines[0]).toMatchObject({ description: "A,100,200,R", signed_amount: 999, reference: "0001" });
});
