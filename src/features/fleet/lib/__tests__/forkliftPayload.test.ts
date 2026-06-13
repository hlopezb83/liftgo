import { describe, it, expect } from "vitest";
import {
  buildForkliftPayload,
  validateForkliftUniqueness,
  mapForkliftMutationError,
} from "../forkliftPayload";
import type { ForkliftFormData } from "../forkliftFormSchema";

const base: ForkliftFormData = {
  name: "MC-01",
  model: "8FBE",
  manufacturer: "Toyota",
  year: "2024",
  capacity_kg: "2500",
  mast_height_m: "4.5",
  fuel_type: "lpg",
  serial_number: "SN-1",
  status: "available",
  daily_rate: "500",
  weekly_rate: "2500",
  monthly_rate: "8000",
  acquisition_cost: "250000",
  notes: "",
  insurance_provider: "",
  insurance_policy_number: "",
  insurance_expiry: "",
  insurance_cost: "",
};

describe("buildForkliftPayload", () => {
  it("coerce numéricos y aplica null para opcionales vacíos", () => {
    const r = buildForkliftPayload({ ...base, manufacturer: "", insurance_cost: "" });
    expect(r.year).toBe(2024);
    expect(r.capacity_kg).toBe(2500);
    expect(r.manufacturer).toBeNull();
    expect(r.insurance_cost).toBeNull();
    expect(r.daily_rate).toBe(500);
  });

  it("usa 0 como fallback en rates vacíos", () => {
    const r = buildForkliftPayload({ ...base, daily_rate: "", monthly_rate: "" });
    expect(r.daily_rate).toBe(0);
    expect(r.monthly_rate).toBe(0);
  });
});

describe("validateForkliftUniqueness", () => {
  it("detecta nombre duplicado", () => {
    const err = validateForkliftUniqueness({ form: base, others: [{ name: "MC-01", serial_number: null }] });
    expect(err).toContain("nombre");
  });

  it("detecta serial duplicado", () => {
    const err = validateForkliftUniqueness({ form: base, others: [{ name: "MC-99", serial_number: "SN-1" }] });
    expect(err).toContain("serie");
  });

  it("retorna null cuando es único", () => {
    expect(validateForkliftUniqueness({ form: base, others: [] })).toBeNull();
  });

  it("ignora serial duplicado cuando el form no tiene serial", () => {
    const err = validateForkliftUniqueness({
      form: { ...base, serial_number: "" },
      others: [{ name: "MC-99", serial_number: "SN-1" }],
    });
    expect(err).toBeNull();
  });
});

describe("mapForkliftMutationError", () => {
  it("mapea constraint de nombre", () => {
    expect(mapForkliftMutationError("violates forklifts_name_unique")).toContain("nombre");
  });
  it("mapea constraint de serial", () => {
    expect(mapForkliftMutationError("violates forklifts_serial_number_unique")).toContain("serie");
  });
  it("retorna mensaje original si no matchea", () => {
    expect(mapForkliftMutationError("otro error")).toBe("otro error");
  });
});
