import { describe, it, expect } from "vitest";
import { forkliftFormSchema } from "../forkliftFormSchema";

describe("forkliftFormSchema", () => {
  it("acepta payload mínimo válido", () => {
    const r = forkliftFormSchema.safeParse({ name: "MX-001", model: "H30FT" });
    expect(r.success).toBe(true);
  });

  it("rechaza nombre vacío", () => {
    const r = forkliftFormSchema.safeParse({ name: "", model: "X" });
    expect(r.success).toBe(false);
  });

  it("rechaza modelo vacío", () => {
    const r = forkliftFormSchema.safeParse({ name: "X", model: "" });
    expect(r.success).toBe(false);
  });

  it("aplica defaults: fuel_type=Diesel, status=available", () => {
    const r = forkliftFormSchema.parse({ name: "X", model: "Y" });
    expect(r.fuel_type).toBe("Diesel");
    expect(r.status).toBe("available");
    expect(r.daily_rate).toBe("");
    expect(r.insurance_provider).toBe("");
  });

  it("preserva valores no-default cuando se proveen", () => {
    const r = forkliftFormSchema.parse({
      name: "MX-100",
      model: "H50",
      fuel_type: "Gas LP",
      daily_rate: "1500",
      capacity_kg: "5000",
    });
    expect(r.fuel_type).toBe("Gas LP");
    expect(r.daily_rate).toBe("1500");
    expect(r.capacity_kg).toBe("5000");
  });

  // R7 Bloque 10a: rangos numéricos vía superRefine.
  const CURRENT_YEAR = new Date().getFullYear();
  it.each([
    ["1979", "year"],
    [String(CURRENT_YEAR + 2), "year"],
    ["0", "capacity_kg"],
    ["-5", "capacity_kg"],
    ["150000", "capacity_kg"],
    ["25", "mast_height_m"],
  ])("rechaza fuera de rango (%s en %s)", (val, field) => {
    const r = forkliftFormSchema.safeParse({ name: "X", model: "Y", [field]: val });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path[0] === field)).toBe(true);
    }
  });

  it("rechaza tarifas negativas y sobre-máximo", () => {
    const r1 = forkliftFormSchema.safeParse({ name: "X", model: "Y", daily_rate: "-1" });
    expect(r1.success).toBe(false);
    const r2 = forkliftFormSchema.safeParse({ name: "X", model: "Y", monthly_rate: "99999999" });
    expect(r2.success).toBe(false);
  });

  it("acepta valores dentro de rango", () => {
    const r = forkliftFormSchema.safeParse({
      name: "X", model: "Y",
      year: "2020", capacity_kg: "5000", mast_height_m: "6",
      daily_rate: "1200", monthly_rate: "30000",
    });
    expect(r.success).toBe(true);
  });
});

