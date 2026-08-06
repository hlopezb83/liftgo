import { describe, it, expect } from "vitest";
import { formatLegalAddress } from "@/lib/format/formatLegalAddress";

describe("formatLegalAddress", () => {
  it("limpia el relleno del catálogo SAT y agrega el C.P.", () => {
    const raw =
      "CAZADORES AVENIDA (AV.) 223 , OTRA NO ESPECIFICADA EN EL CATALOGO, SANTA CATARINA, NUEVO LEON";
    expect(formatLegalAddress(raw, { cp: "66359" })).toBe(
      "AVENIDA CAZADORES 223, SANTA CATARINA, NUEVO LEON, C.P. 66359",
    );
  });

  it("no duplica el C.P. si ya viene en el texto", () => {
    const raw = "AVENIDA CAZADORES 223, SANTA CATARINA, N.L., C.P. 66359";
    expect(formatLegalAddress(raw, { cp: "66359" })).toBe(raw);
  });

  it("respeta domicilios que ya inician con el tipo de vialidad", () => {
    expect(formatLegalAddress("CALLE MORELOS 100, CENTRO, MONTERREY")).toBe(
      "CALLE MORELOS 100, CENTRO, MONTERREY",
    );
  });

  it("elimina partes vacías o 'NINGUNO'", () => {
    expect(formatLegalAddress("AV. JUAREZ 10, NINGUNO, , MONTERREY", { cp: "64000" })).toBe(
      "AV. JUAREZ 10, MONTERREY, C.P. 64000",
    );
  });

  it("devuelve cadena vacía cuando no hay domicilio", () => {
    expect(formatLegalAddress(null)).toBe("");
    expect(formatLegalAddress("   ")).toBe("");
  });
});
