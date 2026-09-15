import { describe, it, expect } from "vitest";
import {
  CONTRACT_TEMPLATE_MESSAGES,
  ContractTemplateUnavailableError,
  resolveSingleDefaultTemplate,
} from "@/features/contracts/lib/contractTemplateResolution";

/**
 * Subtramo 6.1 — la plantilla predeterminada no se elige "la primera": con
 * cero filas hay ausencia explícita y con más de una, ambigüedad explícita.
 */
describe("resolveSingleDefaultTemplate", () => {
  it("ausencia: sin filas devuelve null, nunca una plantilla ajena", () => {
    expect(resolveSingleDefaultTemplate([])).toBeNull();
    expect(resolveSingleDefaultTemplate(null)).toBeNull();
    expect(resolveSingleDefaultTemplate(undefined)).toBeNull();
  });

  it("caso normal: una sola plantilla predeterminada", () => {
    expect(resolveSingleDefaultTemplate([{ id: "t1" }])).toEqual({ id: "t1" });
  });

  it("ambigüedad: dos predeterminadas se detienen con mensaje explícito", () => {
    expect(() => resolveSingleDefaultTemplate([{ id: "t1" }, { id: "t2" }]))
      .toThrowError(ContractTemplateUnavailableError);
    try {
      resolveSingleDefaultTemplate([{ id: "t1" }, { id: "t2" }]);
    } catch (err) {
      expect((err as ContractTemplateUnavailableError).reason).toBe("ambiguous");
      expect((err as Error).message).toBe(CONTRACT_TEMPLATE_MESSAGES.ambiguous);
    }
  });
});
