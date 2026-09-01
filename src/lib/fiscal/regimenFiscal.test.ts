import { describe, expect, it } from "vitest";
import { REGIMEN_FISCAL } from "@/lib/domain/satCatalogs";
import { REGIMEN_FISCAL_CATALOG, regimenAplicaPersona, tipoPersonaFromRfc } from "@/lib/fiscal/regimenFiscal";
import { REGIMEN_FISCAL_CODES } from "../../../supabase/functions/_shared/regimenFiscal.ts";

describe("R8-09: matriz de aplicabilidad de regímenes fiscales", () => {
  it("cubre explícitamente todos los códigos del catálogo (sin fallback permisivo)", () => {
    for (const r of REGIMEN_FISCAL_CATALOG) {
      expect(
        r.aplicaFisica || r.aplicaMoral,
        `El régimen ${r.code} no tiene aplicabilidad explícita`,
      ).toBe(true);
    }
  });

  it("rechaza combinaciones inválidas de los códigos recién declarados", () => {
    expect(regimenAplicaPersona("628", "fisica")).toBe(false); // Hidrocarburos: solo moral
    expect(regimenAplicaPersona("628", "moral")).toBe(true);
    expect(regimenAplicaPersona("609", "fisica")).toBe(false); // Consolidación: solo moral
    expect(regimenAplicaPersona("611", "moral")).toBe(false); // Dividendos: solo física
    expect(regimenAplicaPersona("615", "moral")).toBe(false); // Premios: solo física
    expect(regimenAplicaPersona("607", "moral")).toBe(false); // Enajenación de bienes: solo física
  });

  // R9-12: 629 y 630 (vigentes desde 01-01-2024) son EXCLUSIVOS de persona
  // física según el catálogo oficial c_RegimenFiscal del SAT (Anexo 20 CFDI
  // 4.0). Fuentes de verificación: bambucode/catalogos_sat_JSON
  // (c_RegimenFiscal.json, scrapeado en tiempo real del sitio del SAT) y
  // phpcfdi/resources-sat-catalogs (cfdi_regimenes_fiscales.sql) — ambas
  // reportan fisica="Sí"/moral="No" para ambos códigos.
  it("629 y 630 solo aplican a persona física (catálogo SAT vigente desde 01-01-2024)", () => {
    expect(regimenAplicaPersona("629", "fisica")).toBe(true);
    expect(regimenAplicaPersona("629", "moral")).toBe(false);
    expect(regimenAplicaPersona("630", "fisica")).toBe(true);
    expect(regimenAplicaPersona("630", "moral")).toBe(false);
  });

  it("un código fuera del catálogo nunca aplica", () => {
    expect(regimenAplicaPersona("999", "fisica")).toBe(false);
    expect(regimenAplicaPersona("999", "moral")).toBe(false);
  });

  it("deriva el tipo de persona de la longitud del RFC", () => {
    expect(tipoPersonaFromRfc("XAXX010101000")).toBe("fisica");
    expect(tipoPersonaFromRfc("ABC010101AB1")).toBe("moral");
    expect(tipoPersonaFromRfc("ABC")).toBeNull();
  });
});

describe("paridad de catálogos cliente/servidor", () => {
  it("los códigos del frontend y del edge function coinciden", () => {
    const client = REGIMEN_FISCAL.map((r) => r.code).sort();
    const server = [...REGIMEN_FISCAL_CODES].sort();
    expect(client).toEqual(server);
  });
});
