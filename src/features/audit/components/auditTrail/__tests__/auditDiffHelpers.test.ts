import { describe, it, expect } from "vitest";
import { visibleFields, visibleSnapshot } from "../auditDiffHelpers";

describe("visibleFields", () => {
  it("filtra updated_at, stage_order y search_vector", () => {
    expect(
      visibleFields(["status", "updated_at", "amount", "stage_order", "search_vector"]),
    ).toEqual(["status", "amount"]);
  });

  it("tolera null/undefined", () => {
    expect(visibleFields(null)).toEqual([]);
    expect(visibleFields(undefined)).toEqual([]);
  });
});

describe("visibleSnapshot", () => {
  it("excluye null, empty string, y campos ocultos; ordena alfabéticamente por label traducido", () => {
    const result = visibleSnapshot({
      updated_at: "2026-05-26",
      status: "paid",
      amount: 1000,
      notes: null,
      description: "",
      customer_name: "Acme",
    });
    const keys = result.map(([k]) => k);
    expect(keys).not.toContain("updated_at");
    expect(keys).not.toContain("notes");
    expect(keys).not.toContain("description");
    expect(keys).toContain("status");
    expect(keys).toContain("amount");
    expect(keys).toContain("customer_name");
  });

  it("devuelve [] para null", () => {
    expect(visibleSnapshot(null)).toEqual([]);
  });
});
