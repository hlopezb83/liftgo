import { describe, it, expect } from "vitest";
import { buildTemplateReplacements } from "../contractTemplateReplacements";
import { defaultContractForm } from "../contractFormDefaults";

// Casts mínimos para satisfacer los tipos de Supabase sin acoplar al schema completo.
const customer = {
  id: "c1", name: "Cliente SA",
  address: "Calle 123",
  representante_legal: "Juan Pérez",
} as unknown as Parameters<typeof buildTemplateReplacements>[0]["customer"];

const forklift = {
  id: "f1", manufacturer: "Toyota", model: "8FGCU25",
  serial_number: "SN-001", capacity_kg: 2500, fuel_type: "LPG",
} as unknown as Parameters<typeof buildTemplateReplacements>[0]["forklift"];

describe("buildTemplateReplacements", () => {
  it("rellena todos los placeholders con datos completos", () => {
    const r = buildTemplateReplacements({
      company: { razon_social: "LiftGo SA" },
      customer, forklift,
      form: {
        ...defaultContractForm,
        usage_location: "Bodega Norte",
        max_hours_per_month: "200",
        extra_hour_rate: "150",
        start_date: "2026-01-01", end_date: "2026-12-31",
        monthly_rate: "18000",
      },
    });
    expect(r.EMPRESA_ARRENDADOR).toBe("LiftGo SA");
    expect(r.NOMBRE_CLIENTE).toBe("Cliente SA");
    expect(r.DOMICILIO_CLIENTE).toBe("Calle 123");
    expect(r.MARCA_EQUIPO).toBe("Toyota");
    expect(r.MODELO_EQUIPO).toBe("8FGCU25");
    expect(r.SERIE_EQUIPO).toBe("SN-001");
    expect(r.CAPACIDAD_EQUIPO).toBe("2500 kg");
    expect(r.COMBUSTIBLE_EQUIPO).toBe("LPG");
    expect(r.UBICACION_USO).toBe("Bodega Norte");
    expect(r.HORAS_MAX).toBe("200");
    expect(r.TARIFA_HORA_EXTRA).toBe("150");
    expect(r.FECHA_INICIO).toBe("2026-01-01");
    expect(r.FECHA_FIN).toBe("2026-12-31");
    expect(r.MONTO_RENTA).toBe("18000");
    expect(r.FRECUENCIA_PAGO).toBe("Mensual");
    expect(r.INTERES_MORATORIO).toBe("5");
    expect(r.REPRESENTANTE_LEGAL).toBe("Juan Pérez");
  });

  it("aplica fallbacks cuando faltan campos opcionales", () => {
    const r = buildTemplateReplacements({
      company: null,
      customer: { ...customer, address: null, representante_legal: null } as typeof customer,
      forklift: { ...forklift, capacity_kg: null, fuel_type: null } as typeof forklift,
      form: { ...defaultContractForm },
    });
    expect(r.EMPRESA_ARRENDADOR).toBe("[Nombre de tu empresa]");
    expect(r.DOMICILIO_CLIENTE).toBe("[Domicilio del cliente]");
    expect(r.CAPACIDAD_EQUIPO).toBe("—");
    expect(r.COMBUSTIBLE_EQUIPO).toBe("—");
    expect(r.UBICACION_USO).toBe("[Dirección]");
    expect(r.HORAS_MAX).toBe("[Número]");
    expect(r.TARIFA_HORA_EXTRA).toBe("[Monto]");
    expect(r.FECHA_INICIO).toBe("[Fecha de inicio]");
    expect(r.MONTO_RENTA).toBe("[Monto]");
    expect(r.REPRESENTANTE_LEGAL).toBe("");
  });

  it("MONTO_RENTA prioriza mensual > semanal > diario", () => {
    const f = { ...defaultContractForm, daily_rate: "100", weekly_rate: "600", monthly_rate: "2400" };
    expect(buildTemplateReplacements({ company: null, customer, forklift, form: f }).MONTO_RENTA).toBe("2400");
    const f2 = { ...f, monthly_rate: "0" };
    // monthly_rate "0" es truthy como string → todavía gana
    expect(buildTemplateReplacements({ company: null, customer, forklift, form: f2 }).MONTO_RENTA).toBe("0");
    const f3 = { ...f, monthly_rate: "", weekly_rate: "600", daily_rate: "100" };
    expect(buildTemplateReplacements({ company: null, customer, forklift, form: f3 }).MONTO_RENTA).toBe("600");
    const f4 = { ...f3, weekly_rate: "" };
    expect(buildTemplateReplacements({ company: null, customer, forklift, form: f4 }).MONTO_RENTA).toBe("100");
  });
});
