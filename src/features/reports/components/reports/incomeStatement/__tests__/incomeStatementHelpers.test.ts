import { describe, it, expect } from "vitest";
import { formatCell, formatRowDelta, cellColor, getBreakdownFor } from "../incomeStatementHelpers";
import type { StatementRow, ComparisonRow } from "@/features/reports/hooks/useIncomeStatementData";

const moneyRow = { label: "Total", values: [], total: 0 } as StatementRow;
const pctRow = { label: "Margen", values: [], total: 0, isPercent: true } as StatementRow;
const costRow = { label: "Gasto", values: [], total: 0, isCost: true } as StatementRow;

describe("formatCell", () => {
  it("formatea % cuando isPercent", () => {
    expect(formatCell(pctRow, 42.555)).toBe("42.6%");
  });

  it("formatea como currency en otros casos", () => {
    expect(formatCell(moneyRow, 1500)).toContain("1,500");
  });
});

describe("formatRowDelta", () => {
  it("usa 'pp' para porcentaje", () => {
    const row: ComparisonRow = { label: "x", yearValues: [], delta: 5.3, deltaPct: null, isPercent: true };
    expect(formatRowDelta(row)).toBe("+5.3 pp");
  });

  it("incluye signo + para positivos en currency", () => {
    const row: ComparisonRow = { label: "x", yearValues: [], delta: 1000, deltaPct: null };
    expect(formatRowDelta(row)).toMatch(/^\+/);
  });

  it("no agrega + para negativos", () => {
    const row: ComparisonRow = { label: "x", yearValues: [], delta: -500, deltaPct: null };
    expect(formatRowDelta(row).startsWith("+")).toBe(false);
  });
});

describe("cellColor", () => {
  it("pinta destructivo para costos o valores negativos", () => {
    expect(cellColor(costRow, 100)).toBe("text-destructive");
    expect(cellColor(moneyRow, -100)).toBe("text-destructive");
    expect(cellColor(moneyRow, 100)).toBe("");
  });
});

describe("getBreakdownFor", () => {
  const dep = [{ label: "d", values: [], total: 0 }];
  const rental = [{ label: "r", values: [], total: 0 }];
  const sales = [{ label: "s", values: [], total: 0 }];

  it("mapea labels conocidos a su breakdown", () => {
    expect(getBreakdownFor("(-) Depreciación (Equipos Rentados)", dep, rental, sales)?.key).toBe("dep");
    expect(getBreakdownFor("  Ingresos por Rentas", dep, rental, sales)?.key).toBe("rental");
    expect(getBreakdownFor("  Ingresos por Ventas", dep, rental, sales)?.key).toBe("sales");
  });

  it("devuelve null para label sin breakdown", () => {
    expect(getBreakdownFor("Otro", dep, rental, sales)).toBeNull();
  });
});
