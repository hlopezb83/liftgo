import { describe, expect, it } from "vitest";
import { hasValidRfcChecksum, validateRfcOrMessage } from "./rfcChecksum";
import {
  hasValidRfcChecksum as edgeHasValidRfcChecksum,
  validateRfcOrMessage as edgeValidateRfcOrMessage,
} from "../../../supabase/functions/_shared/rfcChecksum";

describe("hasValidRfcChecksum", () => {
  it("re-exporta exactamente la implementación canónica de Edge Functions", () => {
    expect(hasValidRfcChecksum).toBe(edgeHasValidRfcChecksum);
    expect(validateRfcOrMessage).toBe(edgeValidateRfcOrMessage);
  });

  it("acepta los RFC genéricos del SAT", () => {
    expect(hasValidRfcChecksum("XAXX010101000")).toBe(true);
    expect(hasValidRfcChecksum("XEXX010101000")).toBe(true);
    expect(validateRfcOrMessage("XAXX010101000")).toBeNull();
    expect(validateRfcOrMessage("XEXX010101000")).toBeNull();
  });

  it("rechaza longitudes fuera de 12/13", () => {
    expect(hasValidRfcChecksum("AAA010101")).toBe(false);
    expect(hasValidRfcChecksum("AAAA0101010001")).toBe(false);
    expect(validateRfcOrMessage("")).toContain("obligatorio");
    expect(validateRfcOrMessage("AAA010101")).toContain("formato válido");
  });

  it("es determinista y mantiene paridad con validateRfcOrMessage", () => {
    const base = "AAAA010101AA";
    const valid = "0123456789A".split("").filter((d) => hasValidRfcChecksum(base + d));
    expect(valid).toHaveLength(1);
    for (const d of "0123456789A".split("")) {
      const candidate = base + d;
      const checksumOk = hasValidRfcChecksum(candidate);
      const message = validateRfcOrMessage(candidate);
      expect(message === null).toBe(checksumOk);
    }
  });

  it("mapea correctamente los casos borde del módulo 11 (A y 1)", () => {
    // Implementación de referencia independiente: dígito = 11 - (sum % 11),
    // donde 11 -> "0" y 10 -> "A" (algoritmo SAT).
    const DICT = "0123456789ABCDEFGHIJKLMN&OPQRSTUVWXYZ Ñ";
    const refDigit = (body11: string): string => {
      // body11 = primeros 11 caracteres de un RFC de 12 (persona moral); el
      // SAT alinea el cuerpo a 12 posiciones con un espacio inicial.
      const padded = ` ${body11}`;
      let sum = 0;
      for (let i = 0; i < 12; i++) sum += DICT.indexOf(padded[i]) * (13 - i);
      const v = 11 - (sum % 11);
      return v === 11 ? "0" : v === 10 ? "A" : String(v);
    };
    const seen = new Set<string>();
    for (const tail of ["00", "01", "0A", "1A", "A0", "ZZ", "99", "B7"]) {
      for (const mid of ["010101", "120599", "300287"]) {
        for (const prefix of ["AAA", "GOB", "MEL", "XAA"]) {
          const body = `${prefix}${mid}${tail}`;
          const digit = refDigit(body);
          const r = body + digit;
          seen.add(digit);
          expect(hasValidRfcChecksum(r)).toBe(true);
          expect(validateRfcOrMessage(r)).toBeNull();
          if (digit !== "0") {
            const wrong = body + (digit === "A" ? "1" : "A");
            expect(hasValidRfcChecksum(wrong)).toBe(false);
            expect(validateRfcOrMessage(wrong)).toContain("dígito verificador");
          }
        }
      }
    }
    expect(seen.has("0")).toBe(true);
    expect(seen.has("A")).toBe(true);
    expect(seen.has("1")).toBe(true);
  });

  it("normaliza minúsculas y espacios", () => {
    const base = "AAAA010101AA";
    const digit = "0123456789A".split("").find((d) => hasValidRfcChecksum(base + d))!;
    const raw = ` ${base.toLowerCase()}${digit.toLowerCase()} `;
    expect(hasValidRfcChecksum(raw)).toBe(true);
    expect(validateRfcOrMessage(raw)).toBeNull();
  });
});
