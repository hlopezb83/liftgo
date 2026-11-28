import { describe, it, expect } from "vitest";
import { toStr, toNumStr, orEmpty } from "@/lib/coerce";

describe("toStr", () => {
  it("convierte valores a string", () => {
    expect(toStr("hola")).toBe("hola");
    expect(toStr(42)).toBe("42");
    expect(toStr(true)).toBe("true");
  });

  it("usa fallback para null/undefined", () => {
    expect(toStr(null)).toBe("");
    expect(toStr(undefined)).toBe("");
    expect(toStr(null, "N/A")).toBe("N/A");
  });
});

describe("toNumStr", () => {
  it("convierte números a string", () => {
    expect(toNumStr(0)).toBe("0");
    expect(toNumStr(3.14)).toBe("3.14");
  });

  it("trata null/undefined/empty como fallback", () => {
    expect(toNumStr(null)).toBe("");
    expect(toNumStr(undefined)).toBe("");
    expect(toNumStr("")).toBe("");
    expect(toNumStr(null, "0")).toBe("0");
  });
});

describe("orEmpty", () => {
  it("devuelve el valor si está presente", () => {
    expect(orEmpty("x", "fallback")).toBe("x");
    expect(orEmpty(0, 999)).toBe(0);
    expect(orEmpty(false, true)).toBe(false);
  });

  it("usa fallback para null/undefined", () => {
    expect(orEmpty(null, "fb")).toBe("fb");
    expect(orEmpty(undefined, 5)).toBe(5);
  });
});
