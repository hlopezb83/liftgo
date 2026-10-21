import { describe, expect, it } from "vitest";
import {
  isFavorableStatementDelta,
  statementMonthChunks,
  statementPeriod,
  withStatementCsvContext,
} from "../incomeStatementPresentation";
describe("shared statement export context", () => {
  it("clamps year selection to the actual range, not a full year", () => {
    expect(statementPeriod("2026-10-01", "2026-10-31", "2026")).toEqual({
      periodStart: "2026-10-01",
      periodEnd: "2026-10-31",
    });
    expect(statementPeriod("2025-10-01", "2026-02-28", "2026")).toEqual({
      periodStart: "2026-01-01",
      periodEnd: "2026-02-28",
    });
  });
  it("keeps numeric data and all context in exported CSV rows", () => {
    const rows = withStatementCsvContext(
      [{ Concepto: "Ventas", Total: 100 }],
      {
        accountingBasis: "cash",
        periodStart: "2026-10-01",
        periodEnd: "2026-10-31",
        generatedAt: "2026-10-21T00:00:00Z",
        fxMissingCount: 3,
        rentedWithoutCostCount: 2,
        soldWithoutCostCount: 1,
      },
      { razon_social: "Empresa QA", rfc: "QA" },
    );
    expect(rows[0]).toMatchObject({
      Empresa: "Empresa QA",
      RFC: "QA",
      Total: 100,
      Base: "Efectivo",
      Moneda: "MXN",
    });
    expect(rows[0]["Alcance y exclusiones"]).toContain("3 registros");
    expect(rows[0]["Alcance y exclusiones"]).toContain(
      "0 equipos rentados sin costo",
    );
  });
  it.each([
    [100, true, false],
    [-100, true, true],
    [100, false, true],
    [-100, false, false],
    [null, true, null],
    [0, true, true],
  ] as const)(
    "consistent favorability for %s, cost %s",
    (delta, cost, expected) => {
      expect(isFavorableStatementDelta(delta, cost)).toBe(expected);
    },
  );
});

it.each([1, 12, 24])(
  "partitions %s months without losing or repeating columns",
  (count) => {
    const months = Array.from({ length: count }, (_, i) => i);
    const pages = statementMonthChunks(months);
    expect(pages.flatMap((page) => page.months)).toEqual(months);
    expect(pages.every((page) => page.months.length <= 6)).toBe(true);
    expect(pages.map((page) => page.start)).toEqual(
      Array.from({ length: Math.ceil(count / 6) }, (_, i) => i * 6),
    );
  },
);

it("labels query-wide warnings when an annual filter narrows the exported period", () => {
  const row = withStatementCsvContext(
    [{ Concepto: "Ingresos", Total: 100 }],
    {
      accountingBasis: "accrual",
      periodStart: "2026-01-01",
      periodEnd: "2026-10-31",
      queryPeriodStart: "2025-10-01",
      queryPeriodEnd: "2026-10-31",
      generatedAt: "2026-10-21T00:00:00Z",
      fxMissingCount: 1,
      rentedWithoutCostCount: 0,
      soldWithoutCostCount: 0,
    },
    { razon_social: "QA", rfc: "QA" },
  )[0];
  expect(row["Periodo desde"]).toBe("2026-01-01");
  expect(row["Consulta desde"]).toBe("2025-10-01");
  expect(row["Alcance y exclusiones"]).toContain(
    "consulta completa 2025-10-01 a 2026-10-31",
  );
  expect(row["Alcance y exclusiones"]).toContain(
    "no se recalculan al seleccionar un año",
  );
});
