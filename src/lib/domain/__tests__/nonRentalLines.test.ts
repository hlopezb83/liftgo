import { describe, it, expect } from "vitest";
import { extractNonRentalLines } from "../nonRentalLines";

describe("extractNonRentalLines", () => {
  it("conserva la partida de Servicio de Logística", () => {
    const items = [
      { description: "MC-01 — Renta mensual (Serie: X)", quantity: 1, unit_price: 10_000, total: 10_000 },
      { description: "Servicio de Logística", quantity: 1, unit_price: 2_500, total: 2_500 },
    ];
    const result = extractNonRentalLines(items);
    expect(result).toHaveLength(1);
    expect(result[0].description).toBe("Servicio de Logística");
    expect(result[0].unit_price).toBe(2_500);
    expect(result[0].clave_prod_serv).toBe("78101800");
    expect(result[0].clave_unidad).toBe("E48");
  });

  it("descarta líneas de renta y de venta de equipo", () => {
    const items = [
      { description: "MC-02 — Renta semanal", quantity: 2, unit_price: 500, total: 1_000 },
      { description: "MC-03 — Renta diaria", quantity: 3, unit_price: 200, total: 600 },
      { description: "Toyota 8FBE - Venta de equipo", quantity: 1, unit_price: 250_000, total: 250_000 },
    ];
    expect(extractNonRentalLines(items)).toHaveLength(0);
  });

  it("conserva 'Entrega' y otras partidas ajenas a renta", () => {
    const items = [
      { description: "Entrega en sitio del cliente", quantity: 1, unit_price: 1_500, total: 1_500 },
      { description: "MC-01 — Renta mensual", quantity: 1, unit_price: 10_000, total: 10_000 },
    ];
    const result = extractNonRentalLines(items);
    expect(result).toHaveLength(1);
    expect(result[0].description).toBe("Entrega en sitio del cliente");
  });

  it("devuelve [] si el input no es un arreglo", () => {
    expect(extractNonRentalLines(null)).toEqual([]);
    expect(extractNonRentalLines(undefined)).toEqual([]);
    expect(extractNonRentalLines("string")).toEqual([]);
  });
});
