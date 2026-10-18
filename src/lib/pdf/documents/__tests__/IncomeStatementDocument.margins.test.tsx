import { createElement, type ReactNode } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { IncomeStatementDocument, type IncomeStatementDocumentProps } from "../IncomeStatementDocument";

vi.mock("@react-pdf/renderer", () => {
  const tag = (name: string) => ({ children }: { children?: ReactNode }) => createElement(name, null, children);
  return {
    Document: tag("section"), Page: tag("section"), View: tag("div"), Text: tag("span"),
    StyleSheet: { create: <T,>(styles: T) => styles },
  };
});

afterEach(cleanup);
const props: IncomeStatementDocumentProps = {
  company: null, logoBase64: null, filteredData: [{ month: "Ene" }],
  statementRows: [{ label: "Margen Neto", values: [null], total: null, isPercent: true }],
  comparisonRows: [{ label: "Margen Neto", yearValues: [null, 25], delta: null, deltaPct: null, isPercent: true }],
  yearTotals: [{ year: "2025" }, { year: "2026" }],
  isComparison: false, selectedYear: "all", availableYears: ["2025", "2026"],
  startDate: new Date("2025-01-01"), endDate: new Date("2026-12-31"),
};

describe("N2: texto de márgenes en el componente PDF (renderer simulado)", () => {
  it("muestra No aplica en mes y total sin lanzar", () => {
    render(<IncomeStatementDocument {...props} />);
    expect(screen.getAllByText("No aplica")).toHaveLength(2);
    expect(screen.queryByText("0.0%")).not.toBeInTheDocument();
  });

  it("conserva margen válido y no inventa variación cuando un año no aplica", () => {
    render(<IncomeStatementDocument {...props} isComparison selectedYear="compare" />);
    expect(screen.getAllByText("No aplica")).toHaveLength(2);
    expect(screen.getByText("25.0%")).toBeInTheDocument();
    expect(screen.queryByText("+25.0 pp")).not.toBeInTheDocument();
  });
});
