import { describe, it, expect } from "vitest";
import { formatCell, formatRowDelta, cellColor, getBreakdownFor, type BreakdownRow } from "../incomeStatementHelpers";
import type { StatementRow, ComparisonRow } from "@/features/reports/hooks/useIncomeStatementData";

const pctRow = { label: "Margen", values: [], total: 0, isPercent: true } as StatementRow;
const moneyRow = { label: "Ingresos", values: [], total: 0 } as StatementRow;
const costRow = { label: "Mantto", values: [], total: 0, isCost: true } as StatementRow;

describe("formatCell", () => {
  it("formatea porcentaje con 1 decimal", () => {
    expect(formatCell(pctRow, 25.456)).toBe("25.5%");
  });
  it("usa formatCurrency para rows monetarios", () => {
    expect(formatCell(moneyRow, 1234)).toMatch(/1[.,]?234/);
  });
});

describe("formatRowDelta", () => {
  it("positivo con '+' en pp para porcentaje", () => {
    const row = { ...pctRow, delta: 3.2 } as unknown as ComparisonRow;
    expect(formatRowDelta(row)).toBe("+3.2 pp");
  });
  it("negativo sin signo extra (ya viene en el número)", () => {
    const row = { ...pctRow, delta: -1.5 } as unknown as ComparisonRow;
    expect(formatRowDelta(row)).toBe("-1.5 pp");
  });
  it("usa formatCurrency cuando no es porcentaje", () => {
    const row = { ...moneyRow, delta: 500 } as unknown as ComparisonRow;
    expect(formatRowDelta(row)).toMatch(/^\+/);
  });
});

describe("cellColor", () => {
  it("destructive para rows isCost", () => {
    expect(cellColor(costRow, 100)).toBe("text-destructive");
  });
  it("destructive para valores negativos en row no-cost", () => {
    expect(cellColor(moneyRow, -10)).toBe("text-destructive");
  });
  it("vacío para valor positivo en row no-cost", () => {
    expect(cellColor(moneyRow, 100)).toBe("");
  });
});

describe("getBreakdownFor", () => {
  const dep: BreakdownRow[] = [{ label: "A", values: [1], total: 1 }];
  const rental: BreakdownRow[] = [{ label: "R", values: [1], total: 1 }];
  const sales: BreakdownRow[] = [{ label: "S", values: [1], total: 1 }];

  it("mapea etiquetas exactas", () => {
    expect(getBreakdownFor("(-) Depreciación (Equipos Rentados)", dep, rental, sales))
      .toEqual({ rows: dep, key: "dep" });
    expect(getBreakdownFor("  Ingresos por Rentas", dep, rental, sales))
      .toEqual({ rows: rental, key: "rental" });
    expect(getBreakdownFor("  Ingresos por Ventas", dep, rental, sales))
      .toEqual({ rows: sales, key: "sales" });
  });
  it("retorna null para etiquetas no mapeadas", () => {
    expect(getBreakdownFor("Otra cosa", dep, rental, sales)).toBeNull();
  });
});
