import { describe, it, expect } from "vitest";
import { isValidClabe, maskClabe, CLABE_REGEX } from "@/features/suppliers";

describe("CLABE validation", () => {
  it("acepta 18 dígitos", () => {
    expect(isValidClabe("002180032240946700")).toBe(true);
    expect(CLABE_REGEX.test("002180032240946700")).toBe(true);
  });
  it("rechaza menos de 18", () => {
    expect(isValidClabe("0123")).toBe(false);
  });
  it("rechaza más de 18", () => {
    expect(isValidClabe("0021800322409467001")).toBe(false);
  });
  it("rechaza letras", () => {
    expect(isValidClabe("01234567890123ABCD")).toBe(false);
  });
  it("acepta vacío o null (campo opcional)", () => {
    expect(isValidClabe(null)).toBe(true);
    expect(isValidClabe("")).toBe(true);
    expect(isValidClabe(undefined)).toBe(true);
  });
});

describe("maskClabe", () => {
  it("enmascara mostrando los últimos 4", () => {
    expect(maskClabe("002180032240946700")).toBe("••••••••••••••6700");
  });
  it("renderiza '—' cuando es null", () => {
    expect(maskClabe(null)).toBe("—");
  });
  it("devuelve sin mascarar si <4", () => {
    expect(maskClabe("12")).toBe("12");
  });
});
