/**
 * Lote 8 — coerce.ts: casos no cubiertos en coerce.test.ts / coerce.extras.test.ts
 *
 * OMISIONES REPORTADAS:
 *   - toStr("", "N/A"): la fuente NO aplica fallback para ""; String("") === "".
 *     Escribir expect(toStr("", "N/A")).toBe("N/A") fallaría → caso OMITIDO.
 */
import { describe, it, expect } from "vitest";
import { toStr, toNumStr } from "@/lib/coerce";

describe("toStr — casos Lote 8", () => {
  it('convierte 0 a "0" (no usa fallback)', () => {
    expect(toStr(0)).toBe("0");
    expect(toStr(0, "fallback")).toBe("0");
  });

  it('cadena vacía "" no activa fallback (no es null/undefined)', () => {
    // String("") === "" — coincide con el fallback por defecto, pero NO por lógica de fallback.
    expect(toStr("")).toBe("");
    // Con fallback custom: la fuente devuelve String("") = "", NO el fallback.
    expect(toStr("", "N/A")).toBe("");
  });
});

describe("toNumStr — casos Lote 8", () => {
  it('string "0" → "0" (no es vacío; no usa fallback)', () => {
    expect(toNumStr("0")).toBe("0");
    expect(toNumStr("0", "fallback")).toBe("0");
  });

  it('string "" → fallback', () => {
    expect(toNumStr("")).toBe("");
    expect(toNumStr("", "N/A")).toBe("N/A");
  });
});
