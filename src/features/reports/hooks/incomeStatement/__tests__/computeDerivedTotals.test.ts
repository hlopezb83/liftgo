import { describe, it, expect } from "vitest";
import { computeDerivedTotals, emptyExpenses } from "../types";

describe("computeDerivedTotals (P&L)", () => {
  it("excluye software y depreciación del Total de Egresos operativos", () => {
    const t = {
      revenue: 10000,
      maintenanceCost: 0,
      damageCost: 0,
      depreciation: 0,
      cogsForkliftSales: 0,
      expenses: { ...emptyExpenses(), software: 999_999, depreciacion: 999_999 },
    };
    const r = computeDerivedTotals(t);
    expect(r.totalExpenses).toBe(0);
    expect(r.netProfit).toBe(10000);
    expect(r.margin).toBe(100);
  });

  it("ignora la categoría costo_venta (se consolida con cogsForkliftSales aguas arriba)", () => {
    const t = {
      revenue: 10000,
      maintenanceCost: 0,
      damageCost: 0,
      depreciation: 0,
      cogsForkliftSales: 0,
      // costo_venta debe ser movido a cogsForkliftSales por useMonthlyData antes
      // de llegar aquí. Si llega como expense, no se considera (evita duplicar).
      expenses: { ...emptyExpenses(), costo_venta: 4000 },
    };
    const r = computeDerivedTotals(t);
    expect(r.grossProfit).toBe(10000);
    expect(r.totalExpenses).toBe(0);
    expect(r.netProfit).toBe(10000);
  });

  it("cuenta cogsForkliftSales (COGS consolidado) como costo directo", () => {
    const t = {
      revenue: 10000,
      maintenanceCost: 0,
      damageCost: 0,
      depreciation: 0,
      cogsForkliftSales: 4000,
      expenses: emptyExpenses(),
    };
    const r = computeDerivedTotals(t);
    expect(r.grossProfit).toBe(6000);
    expect(r.grossMargin).toBe(60);
    expect(r.totalExpenses).toBe(4000);
    expect(r.netProfit).toBe(6000);
  });

  it("resta depreciación solo en Utilidad Neta", () => {
    const t = {
      revenue: 10000,
      maintenanceCost: 1000,
      damageCost: 500,
      depreciation: 2000,
      cogsForkliftSales: 0,
      expenses: { ...emptyExpenses(), nomina: 1500 },
    };
    const r = computeDerivedTotals(t);
    // grossProfit = 10000 - 1000 - 500 - 0 = 8500
    expect(r.grossProfit).toBe(8500);
    // totalExpenses = 1000 + 500 + 0 + 1500 = 3000
    expect(r.totalExpenses).toBe(3000);
    // profitBeforeDepreciation = 10000 - 3000 = 7000
    expect(r.profitBeforeDepreciation).toBe(7000);
    // netProfit = 7000 - 2000 = 5000
    expect(r.netProfit).toBe(5000);
    expect(r.margin).toBe(50);
  });

  it("evita división por cero cuando no hay ingresos", () => {
    const t = {
      revenue: 0,
      maintenanceCost: 0,
      damageCost: 0,
      depreciation: 100,
      cogsForkliftSales: 0,
      expenses: emptyExpenses(),
    };
    const r = computeDerivedTotals(t);
    expect(r.grossMargin).toBe(0);
    expect(r.margin).toBe(0);
    expect(r.netProfit).toBe(-100);
  });
});
