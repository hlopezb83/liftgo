import { describe, it, expect } from "vitest";
import { contractFormSchema } from "../contractFormSchema";
import { defaultContractForm } from "../../hooks/contractForm/contractFormDefaults";

describe("contractFormSchema", () => {
  const validBase = {
    ...defaultContractForm,
    customer_id: "cust-1",
    forklift_id: "flk-1",
    start_date: "2026-01-01",
    end_date: "2026-06-30",
  };

  it("acepta un payload válido con cliente + equipo + rango correcto", () => {
    const parsed = contractFormSchema.safeParse(validBase);
    expect(parsed.success).toBe(true);
  });

  it("rechaza cuando falta customer_id", () => {
    const parsed = contractFormSchema.safeParse({ ...validBase, customer_id: "" });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      const msg = parsed.error.issues.find((i) => i.path[0] === "customer_id")?.message;
      expect(msg).toMatch(/Cliente requerido/i);
    }
  });

  it("rechaza cuando falta forklift_id", () => {
    const parsed = contractFormSchema.safeParse({ ...validBase, forklift_id: "" });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      const msg = parsed.error.issues.find((i) => i.path[0] === "forklift_id")?.message;
      expect(msg).toMatch(/Equipo requerido/i);
    }
  });

  it("rechaza tarifas negativas", () => {
    const parsed = contractFormSchema.safeParse({ ...validBase, daily_rate: "-1" });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.some((i) => i.path[0] === "daily_rate")).toBe(true);
    }
  });

  it("rechaza end_date < start_date", () => {
    const parsed = contractFormSchema.safeParse({
      ...validBase,
      start_date: "2026-06-01",
      end_date: "2026-05-31",
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      const msg = parsed.error.issues.find((i) => i.path[0] === "end_date")?.message;
      expect(msg).toMatch(/posterior/i);
    }
  });

  it("acepta rango vacío (fechas opcionales)", () => {
    const parsed = contractFormSchema.safeParse({ ...validBase, start_date: "", end_date: "" });
    expect(parsed.success).toBe(true);
  });
});
