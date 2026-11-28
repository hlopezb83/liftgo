import { describe, expect, it } from "vitest";
import { sanitizeCsfName, sanitizeLegalName } from "../csfSanitize";

describe("sanitizeCsfName / sanitizeLegalName", () => {
  it("expone la misma implementación canónica para cliente y servidor", () => {
    expect(sanitizeCsfName).toBe(sanitizeLegalName);
  });

  it("quita 'SOCIEDAD ANÓNIMA DE CAPITAL VARIABLE'", () => {
    expect(sanitizeCsfName("LOGISTORAGE SOCIEDAD ANÓNIMA DE CAPITAL VARIABLE"))
      .toBe("LOGISTORAGE");
  });

  it("quita regímenes societarios completos adicionales del SAT", () => {
    expect(
      sanitizeCsfName(
        "GRUPO FINANCIERO SOCIEDAD ANÓNIMA BURSÁTIL DE CAPITAL VARIABLE",
      ),
    ).toBe("GRUPO FINANCIERO");
    expect(
      sanitizeCsfName(
        "CAPITAL SEMILLA SOCIEDAD ANÓNIMA PROMOTORA DE INVERSIÓN DE CAPITAL VARIABLE",
      ),
    ).toBe("CAPITAL SEMILLA");
    expect(
      sanitizeCsfName(
        "TALLERES DEL NORTE SOCIEDAD DE RESPONSABILIDAD LIMITADA DE CAPITAL VARIABLE",
      ),
    ).toBe("TALLERES DEL NORTE");
    expect(
      sanitizeCsfName("INNOVACION DIGITAL SOCIEDAD POR ACCIONES SIMPLIFICADA"),
    ).toBe("INNOVACION DIGITAL");
    expect(sanitizeCsfName("DESPACHO CONTABLE, SOCIEDAD CIVIL")).toBe(
      "DESPACHO CONTABLE",
    );
    expect(sanitizeCsfName("FUNDACION EDUCATIVA, ASOCIACIÓN CIVIL")).toBe(
      "FUNDACION EDUCATIVA",
    );
  });

  it("quita 'S.A. DE C.V.', 'S. DE R.L. DE C.V.', 'SAPI DE C.V.' y 'S.A.S.'", () => {
    expect(sanitizeCsfName("ACME S.A. DE C.V.")).toBe("ACME");
    expect(sanitizeCsfName("Árbol, S.A. de C.V.")).toBe("ARBOL");
    expect(sanitizeCsfName("FOO S. DE R.L. DE C.V.")).toBe("FOO");
    expect(sanitizeCsfName("BAR SAPI DE C.V.")).toBe("BAR");
    expect(sanitizeCsfName("TECH LABS, S.A.S.")).toBe("TECH LABS");
    expect(sanitizeCsfName("CONSULTORES, S.C.")).toBe("CONSULTORES");
    expect(sanitizeCsfName("PATRONATO, A.C.")).toBe("PATRONATO");
  });

  it("preserva iniciales intermedias ('A C', 'S C') y limpia sufijos encadenados o puntuación final", () => {
    expect(sanitizeCsfName("GARCIA A C TRANSPORTES, S.A. DE C.V.")).toBe(
      "GARCIA A C TRANSPORTES",
    );
    expect(sanitizeCsfName("SERVICIOS S C DEL NORTE, S. DE R.L. DE C.V.")).toBe(
      "SERVICIOS S C DEL NORTE",
    );
    expect(
      sanitizeCsfName("  EMPRESA DEMO, SOCIEDAD ANONIMA, S.A. DE C.V..;:  "),
    ).toBe("EMPRESA DEMO");
  });

  it("normaliza mayúsculas y acentos en persona física", () => {
    expect(sanitizeCsfName("José Pérez Núñez")).toBe("JOSE PEREZ NUNEZ");
  });

  it("devuelve cadena vacía para null, undefined o vacío", () => {
    expect(sanitizeCsfName(null)).toBe("");
    expect(sanitizeCsfName(undefined)).toBe("");
    expect(sanitizeCsfName("")).toBe("");
    expect(sanitizeCsfName("   ")).toBe("");
  });

  it("quita SOCIEDAD ANÓNIMA sin capital variable", () => {
    expect(sanitizeCsfName("EMPRESA SOCIEDAD ANONIMA")).toBe("EMPRESA");
  });
});
