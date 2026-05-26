import { describe, it, expect } from "vitest";
import { buildPlaceholderVars } from "@/lib/pdf/contract/placeholders";
import { CONTRACT_PLACEHOLDERS } from "@/lib/pdf/contract/placeholderRegistry";
import { replacePlaceholders } from "@/lib/domain/templateUtils";
import type { ContractData } from "@/lib/pdf/contract/fetchers";

const baseContract: ContractData = {
  id: "ct1",
  customer_id: "c1",
  forklift_id: "f1",
  customer_name: "Cliente Demo",
  start_date: "2026-01-15",
  end_date: "2026-12-31",
  daily_rate: 100,
  weekly_rate: 600,
  monthly_rate: 2400,
  deposit_amount: 5000,
  usage_location: "Planta Monterrey",
  max_hours_per_month: 200,
  extra_hour_rate: 50,
  payment_frequency: "Mensual",
  late_interest_rate: 7,
  contract_city: "Monterrey, N.L.",
} as unknown as ContractData;

describe("buildPlaceholderVars", () => {
  it("genera valores para todas las llaves declaradas en el registro", () => {
    const vars = buildPlaceholderVars(
      baseContract,
      { razon_social: "LiftGo S.A." },
      { name: "Acme", address: "Av. 123", rfc: "AAA010101AAA", representante_legal: "Juan" },
      { manufacturer: "Toyota", model: "8FGCU25", serial_number: "SN-1", capacity_kg: 2500, fuel_type: "LPG" },
    );

    for (const { key } of CONTRACT_PLACEHOLDERS) {
      const cleanKey = key.replace(/[{}]/g, "");
      expect(vars[cleanKey], `falta placeholder ${key}`).toBeDefined();
    }
  });

  it("usa fallbacks legibles cuando faltan datos", () => {
    const vars = buildPlaceholderVars(baseContract, null, null, null);
    expect(vars.arrendador).toBe("[Arrendador]");
    expect(vars.domicilio_cliente).toBe("[Domicilio del cliente]");
    expect(vars.marca).toBe("—");
    expect(vars.ciudad).toBe("Monterrey, N.L.");
  });

  it("reemplaza placeholders en una plantilla de contrato", () => {
    const vars = buildPlaceholderVars(
      baseContract,
      { razon_social: "LiftGo S.A." },
      { name: "Acme", address: "Av. 123", rfc: "X", representante_legal: "Juan" },
      { manufacturer: "Toyota", model: "8FGCU25", serial_number: "SN", capacity_kg: 2500, fuel_type: "LPG" },
    );
    const text = "Entre {arrendador} y {arrendatario} en {ciudad}.";
    expect(replacePlaceholders(text, vars)).toBe("Entre LiftGo S.A. y Acme en Monterrey, N.L..");
  });
});
