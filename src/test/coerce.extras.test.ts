import { describe, it, expect } from "vitest";
import { toStr, toNumStr, orEmpty } from "@/lib/coerce";

describe("toStr (extras)", () => {
  it("convierte números y booleans a string", () => {
    expect(toStr(42)).toBe("42");
    expect(toStr(true)).toBe("true");
  });
});

describe("toNumStr (extras)", () => {
  it("convierte 0 a '0' (no a fallback)", () => {
    expect(toNumStr(0)).toBe("0");
  });

  it("usa fallback custom para vacíos", () => {
    expect(toNumStr("", "0")).toBe("0");
    expect(toNumStr(null, "—")).toBe("—");
  });
});

describe("orEmpty", () => {
  it("retorna value cuando existe (incluido 0 y false)", () => {
    expect(orEmpty(0, 99)).toBe(0);
    expect(orEmpty(false, true)).toBe(false);
    expect(orEmpty("texto", "fallback")).toBe("texto");
  });

  it("retorna fallback para null/undefined", () => {
    expect(orEmpty(null, "x")).toBe("x");
    expect(orEmpty(undefined, "x")).toBe("x");
  });
});
