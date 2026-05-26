import { describe, it, expect } from "vitest";
import { sortQuotesByCompanyMatch, validateDealValue, STAGES_REQUIRING_DEAL_VALUE } from "../prospectFormSchema";

describe("sortQuotesByCompanyMatch", () => {
  const quotes = [
    { id: "1", customer_name: "Acme S.A." },
    { id: "2", customer_name: "Globex" },
    { id: "3", customer_name: "Acme Industries" },
  ];

  it("devuelve la lista sin cambios si no hay company", () => {
    expect(sortQuotesByCompanyMatch(quotes, "  ").map((q) => q.id)).toEqual(["1", "2", "3"]);
  });

  it("sube los matches al inicio (case-insensitive)", () => {
    const sorted = sortQuotesByCompanyMatch(quotes, "acme");
    expect(sorted[0].customer_name).toMatch(/Acme/);
    expect(sorted[1].customer_name).toMatch(/Acme/);
    expect(sorted[2].customer_name).toBe("Globex");
  });
});

describe("validateDealValue", () => {
  it("rechaza ≤0 cuando se requiere", () => {
    const r = validateDealValue("0", true);
    expect(r.error).toBeTruthy();
    expect(r.value).toBe(0);
  });

  it("acepta valor positivo cuando se requiere", () => {
    const r = validateDealValue("1500", true);
    expect(r.error).toBeNull();
    expect(r.value).toBe(1500);
  });

  it("no exige valor en etapas tempranas", () => {
    const r = validateDealValue("", false);
    expect(r.error).toBeNull();
    expect(r.value).toBe(0);
  });
});

describe("STAGES_REQUIRING_DEAL_VALUE", () => {
  it("incluye las 4 etapas avanzadas y excluye nuevo/contactado", () => {
    expect(STAGES_REQUIRING_DEAL_VALUE).toContain("cotizacion_enviada");
    expect(STAGES_REQUIRING_DEAL_VALUE).toContain("cerrado_ganado");
    expect(STAGES_REQUIRING_DEAL_VALUE).not.toContain("nuevo_prospecto");
    expect(STAGES_REQUIRING_DEAL_VALUE).not.toContain("contactado");
  });
});
