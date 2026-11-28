import { describe, it, expect } from "vitest";
import { numeroALetras } from "@/lib/format/numeroALetras";

describe("numeroALetras", () => {
  it("maneja cero y nulos", () => {
    expect(numeroALetras(0)).toBe("CERO PESOS 00/100 M.N.");
    expect(numeroALetras(null)).toBe("CERO PESOS 00/100 M.N.");
    expect(numeroALetras(undefined)).toBe("CERO PESOS 00/100 M.N.");
  });

  it("usa singular para un peso", () => {
    expect(numeroALetras(1)).toBe("UN PESO 00/100 M.N.");
  });

  it("convierte decenas y veintenas", () => {
    expect(numeroALetras(21)).toBe("VEINTIÚN PESOS 00/100 M.N.");
    expect(numeroALetras(101)).toBe("CIENTO UN PESOS 00/100 M.N.");
    expect(numeroALetras(35)).toBe("TREINTA Y CINCO PESOS 00/100 M.N.");
    expect(numeroALetras(100)).toBe("CIEN PESOS 00/100 M.N.");
    expect(numeroALetras(115)).toBe("CIENTO QUINCE PESOS 00/100 M.N.");
  });

  it('usa "UN MIL" y millones', () => {
    expect(numeroALetras(1000)).toBe("UN MIL PESOS 00/100 M.N.");
    expect(numeroALetras(350000)).toBe("TRESCIENTOS CINCUENTA MIL PESOS 00/100 M.N.");
    expect(numeroALetras(1_000_000)).toBe("UN MILLÓN PESOS 00/100 M.N.");
    expect(numeroALetras(2_500_000)).toBe("DOS MILLONES QUINIENTOS MIL PESOS 00/100 M.N.");
  });

  it("incluye centavos y redondea a dos decimales", () => {
    expect(numeroALetras(1234.5)).toBe("UN MIL DOSCIENTOS TREINTA Y CUATRO PESOS 50/100 M.N.");
    expect(numeroALetras(0.145)).toBe("CERO PESOS 15/100 M.N.");
    expect(numeroALetras(99.999)).toBe("CIEN PESOS 00/100 M.N.");
  });
});
