import { describe, it, expect } from "vitest";
import { sanitizeCsfName } from "../csfSanitize";

describe("sanitizeCsfName", () => {
  it("quita 'SOCIEDAD ANÓNIMA DE CAPITAL VARIABLE'", () => {
    expect(sanitizeCsfName("LOGISTORAGE SOCIEDAD ANÓNIMA DE CAPITAL VARIABLE"))
      .toBe("LOGISTORAGE");
  });

  it("quita 'S.A. DE C.V.'", () => {
    expect(sanitizeCsfName("ACME S.A. DE C.V.")).toBe("ACME");
  });

  it("quita 'S. DE R.L. DE C.V.'", () => {
    expect(sanitizeCsfName("FOO S. DE R.L. DE C.V.")).toBe("FOO");
  });

  it("quita 'SAPI DE C.V.'", () => {
    expect(sanitizeCsfName("BAR SAPI DE C.V.")).toBe("BAR");
  });

  it("normaliza mayúsculas y acentos en persona física", () => {
    expect(sanitizeCsfName("José Pérez Núñez")).toBe("JOSE PEREZ NUNEZ");
  });

  it("devuelve cadena vacía para null o vacío", () => {
    expect(sanitizeCsfName(null)).toBe("");
    expect(sanitizeCsfName("")).toBe("");
  });

  it("quita SOCIEDAD ANÓNIMA sin capital variable", () => {
    expect(sanitizeCsfName("EMPRESA SOCIEDAD ANONIMA")).toBe("EMPRESA");
  });
});
