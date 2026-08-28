import { describe, it, expect } from "vitest";
import { replacePlaceholders } from "@/lib/domain/templateUtils";
import type { ContractData } from "@/lib/pdf/contract/fetchers";
import { DEFAULT_PAGARE } from "@/lib/pdf/contract/data-templates";
import { CONTRACT_PLACEHOLDERS } from "@/lib/pdf/contract/placeholderRegistry";
import { buildPagareVars, buildPlaceholderVars } from "@/lib/pdf/contract/placeholders";

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

  it("monto_pagare usa el costo de adquisición del equipo", () => {
    const vars = buildPlaceholderVars(baseContract, null, null, {
      manufacturer: "Toyota",
      acquisition_cost: 350000,
    });
    expect(vars.monto_pagare).toContain("350,000");
    expect(vars.deposito).toContain("5,000");
  });

  it("monto_pagare cae al depósito si el equipo no tiene costo de adquisición", () => {
    const vars = buildPlaceholderVars(baseContract, null, null, { manufacturer: "Toyota" });
    expect(vars.monto_pagare).toBe(vars.deposito);
  });

  it("en el pagaré, {deposito} legado se resuelve al monto del pagaré", () => {
    const vars = buildPagareVars(
      buildPlaceholderVars(baseContract, null, null, { acquisition_cost: 350000 }),
    );
    expect(vars.deposito).toBe(vars.monto_pagare);
    expect(vars.deposito).toContain("350,000");
  });

  it("el pagaré respeta un 0% capturado explícitamente (G-A3)", () => {
    const vars = buildPagareVars(
      buildPlaceholderVars({ ...baseContract, late_interest_rate: 0 } as ContractData, null, null, null),
    );
    expect(vars.interes_moratorio).toBe("0");
  });

  it("el pagaré usa 5% de mora cuando la tasa no es válida", () => {
    const vars = buildPagareVars({ ...buildPlaceholderVars(baseContract, null, null, null), interes_moratorio: "" });
    expect(vars.interes_moratorio).toBe("5");
  });


  it("el pagaré respeta la tasa de mora capturada", () => {
    const vars = buildPagareVars(buildPlaceholderVars(baseContract, null, null, null));
    expect(vars.interes_moratorio).toBe("7");
  });

  it("el texto por defecto del pagare no deja placeholders sin resolver", () => {
    const vars = buildPlaceholderVars(
      { ...baseContract, contract_number: "CT-2026-001" } as ContractData,
      { razon_social: "LiftGo S.A." },
      { name: "Acme" },
      { manufacturer: "Toyota", model: "8FGCU25", serial_number: "SN-1", acquisition_cost: 350000 },
    );
    const texto = replacePlaceholders(DEFAULT_PAGARE, vars);
    expect(texto).not.toMatch(/\{[a-z_]+\}/);
    expect(texto).toContain("TRESCIENTOS CINCUENTA MIL PESOS 00/100 M.N.");
    expect(texto).toContain("CT-2026-001");
  });

  it("usa fallbacks legibles cuando faltan datos", () => {
    const vars = buildPlaceholderVars(baseContract, null, null, null);
    expect(vars.arrendador).toBe("[Arrendador]");
    expect(vars.domicilio_cliente).toBe("[Domicilio del cliente]");
    expect(vars.marca).toBe("—");
    expect(vars.ciudad).toBe("Monterrey, N.L.");
  });

  it("respeta un interés moratorio de 0% y expone firmado_por", () => {
    const vars = buildPlaceholderVars(
      { ...baseContract, late_interest_rate: 0, signed_by: "MAHA MESTASSI", max_hours_per_month: 0 },
      null,
      null,
      null,
    );
    expect(vars.interes_moratorio).toBe("0");
    expect(vars.horas_max).toBe("0");
    expect(vars.firmado_por).toBe("MAHA MESTASSI");
  });

  it("usa 5% de interés cuando el dato no está capturado", () => {
    const vars = buildPlaceholderVars(
      { ...baseContract, late_interest_rate: null } as unknown as ContractData,
      null, null, null,
    );
    expect(vars.interes_moratorio).toBe("5");
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
