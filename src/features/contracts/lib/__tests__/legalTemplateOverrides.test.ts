import { describe, expect, it } from "vitest";
import { normalizeLegalTemplateOverrides } from "../legalTemplateOverrides";

describe("normalizeLegalTemplateOverrides", () => {
  it("normaliza sólo los cinco campos locales permitidos", () => {
    expect(normalizeLegalTemplateOverrides({
      city: " Monterrey ",
      jurisdiction: "Nuevo León",
      legal_representative: "Ana Pérez",
      witness_1: "Luis",
      witness_2: "María",
      clauses: ["no permitido"],
    })).toEqual({
      city: "Monterrey",
      jurisdiction: "Nuevo León",
      legal_representative: "Ana Pérez",
      witness_1: "Luis",
      witness_2: "María",
    });
  });

  it("convierte entradas ausentes o no textuales en campos vacíos", () => {
    expect(normalizeLegalTemplateOverrides({ city: 123, witness_1: null })).toEqual({
      city: "",
      jurisdiction: "",
      legal_representative: "",
      witness_1: "",
      witness_2: "",
    });
  });
});

