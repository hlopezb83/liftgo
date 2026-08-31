import { describe, it, expect } from "vitest";
import { decodeStatementFile } from "../decodeStatementFile";

function fileFromBytes(bytes: number[], name = "estado.csv"): File {
  return new File([new Uint8Array(bytes)], name);
}

/**
 * B5-07: leer con `file.text()` fuerza UTF-8 y produce mojibake con archivos
 * Windows-1252. `decodeStatementFile` detecta bytes inválidos en UTF-8 y cae
 * a windows-1252.
 */
describe("decodeStatementFile · fallback Windows-1252 (B5-07)", () => {
  it("decodifica UTF-8 válido tal cual", async () => {
    const text = "Depósito núm. 1, comisión";
    const bytes = Array.from(new TextEncoder().encode(text));
    const result = await decodeStatementFile(fileFromBytes(bytes));
    expect(result).toBe(text);
  });

  it("cae a windows-1252 cuando los bytes no son UTF-8 válido", async () => {
    // "Depósito" en windows-1252: 'ó' = 0xF3 (inválido como continuación UTF-8 aislada).
    const bytes = [0x44, 0x65, 0x70, 0xF3, 0x73, 0x69, 0x74, 0x6F]; // "Dep\xF3sito"
    const result = await decodeStatementFile(fileFromBytes(bytes));
    expect(result).toBe("Depósito");
  });

  it("cae a windows-1252 si UTF-8 produce carácter de reemplazo", async () => {
    const bytes = [0x4e, 0xf1, 0x41]; // "N\xF1A" -> windows-1252 "NñA"
    const result = await decodeStatementFile(fileFromBytes(bytes));
    expect(result).toBe("NñA");
  });
});
