import { describe, expect, it } from "vitest";
import type { ParseResult } from "../../../lib/bankParseUtils";
import { mappingSignature, shouldUseXml } from "../analysis";
import { analysisMatchesIdentity, buildAnalyzedUpload } from "../analyzedUpload";
import { exceedsSizeLimit, MAX_FILE_SIZE_BYTES, MAX_PARSED_LINES, tooManyLines } from "../limits";
import { loadMapping, saveMapping } from "../mappingStorage";

function fakeFile(size: number, name = "estado.csv") {
  const file = new File(["fecha,monto\n"], name, { type: "text/csv" });
  Object.defineProperty(file, "size", { value: size });
  return file;
}

const emptyResult: ParseResult = { lines: [], errors: [], periodStart: null, periodEnd: null };

describe("helpers de carga de estados de cuenta", () => {
  it("detecta XML por contenido, perfil o extensión", () => {
    expect(shouldUseXml("  <movimientos />", "generico", "a.csv")).toBe(true);
    expect(shouldUseXml("fecha,monto", "bbva_xml", "a.csv")).toBe(true);
    expect(shouldUseXml("fecha,monto", "generico", "A.XML")).toBe(true);
    expect(shouldUseXml("fecha,monto", "generico", "a.csv")).toBe(false);
  });

  it("firma el mapeo de forma estable sin importar el orden de las llaves", () => {
    expect(mappingSignature({ amount: "monto", date: "fecha" }))
      .toBe(mappingSignature({ date: "fecha", amount: "monto" }));
    expect(mappingSignature({})).toBe("");
  });

  it("aplica los límites de tamaño y de movimientos", () => {
    expect(exceedsSizeLimit(fakeFile(MAX_FILE_SIZE_BYTES))).toBe(false);
    expect(exceedsSizeLimit(fakeFile(MAX_FILE_SIZE_BYTES + 1))).toBe(true);
    expect(tooManyLines(emptyResult)).toBe(false);
    expect(tooManyLines({
      ...emptyResult,
      lines: Array.from({ length: MAX_PARSED_LINES + 1 }, () => ({
        posted_date: "2026-01-01", description: "m", signed_amount: 1,
        reference: null, line_seq: 1, hash: "h", occurrence: 1,
      })),
    })).toBe(true);
  });

  it("invalida la identidad cuando cambia archivo, cuenta, perfil o mapeo XML", () => {
    const file = fakeFile(1024);
    const analyzed = buildAnalyzedUpload({
      bankAccountId: "acc-1", file, profile: "generico", isXml: true,
      effectiveMapping: { date: "fecha" }, result: emptyResult,
    });
    const base = { file, bankAccountId: "acc-1", profile: "generico" as const, mapping: { date: "fecha" } };
    expect(analysisMatchesIdentity(analyzed, base)).toBe(true);
    expect(analysisMatchesIdentity(analyzed, { ...base, bankAccountId: "acc-2" })).toBe(false);
    expect(analysisMatchesIdentity(analyzed, { ...base, mapping: { date: "fecha_alt" } })).toBe(false);
    expect(analysisMatchesIdentity(analyzed, { ...base, file: fakeFile(1024) })).toBe(false);
  });

  it("recuerda el mapeo por cuenta y tolera contenido inválido", () => {
    saveMapping("acc-1", { date: "fecha" });
    expect(loadMapping("acc-1")).toEqual({ date: "fecha" });
    expect(loadMapping("acc-2")).toEqual({});
    localStorage.setItem("liftgo:bank-xml-mapping:acc-3", "{no-json");
    expect(loadMapping("acc-3")).toEqual({});
  });
});
