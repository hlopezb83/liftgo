import type { jsPDF } from "jspdf";
import { fetchCompanyDataAndLogo } from "@/lib/pdf/shared";
import type { StatementRow, ComparisonRow, YearTotals, MonthData } from "@/hooks/useIncomeStatementData";
import { drawIncomeStatementHeader, drawTableHeader } from "./incomeStatement/header";
import { drawStatementRow } from "./incomeStatement/rows";

interface ExportPdfParams {
  filteredData: MonthData[];
  statementRows: StatementRow[];
  comparisonRows: ComparisonRow[];
  yearTotals: YearTotals[];
  isComparison: boolean;
  selectedYear: string;
  availableYears: string[];
  startDate: Date;
  endDate: Date;
}

export async function exportIncomeStatementPdf(params: ExportPdfParams): Promise<void> {
  const {
    filteredData, statementRows, comparisonRows, yearTotals,
    isComparison, selectedYear, availableYears, startDate, endDate,
  } = params;

  const { jsPDF } = await import("jspdf");
  const { company, logoBase64 } = await fetchCompanyDataAndLogo();

  const doc: jsPDF = new jsPDF({ orientation: "landscape" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 14;

  let y = drawIncomeStatementHeader(
    doc, 16, company, logoBase64,
    selectedYear, availableYears, startDate, endDate,
  );

  const rows = isComparison ? comparisonRows : statementRows;
  const colHeaders = isComparison
    ? [...yearTotals.map((yt) => yt.year), "Var. $", "Var. %"]
    : [...filteredData.map((d) => d.month), "Total"];

  const labelColW = 50;
  const availableW = pageWidth - margin * 2 - labelColW;
  const colW = Math.min(availableW / colHeaders.length, 28);

  y = drawTableHeader(doc, y, colHeaders, labelColW, colW);

  doc.setFontSize(7);
  for (const row of rows) {
    if (y > doc.internal.pageSize.getHeight() - 15) {
      doc.addPage();
      y = 16;
    }
    drawStatementRow({ doc, row, y, labelColW, colW, isComparison });
    y += 2;
    doc.setDrawColor(230, 230, 230);
    doc.setLineWidth(0.15);
    doc.line(margin, y, pageWidth - margin, y);
    y += 4;
  }

  doc.save(`estado-resultados${selectedYear !== "all" ? `-${selectedYear}` : ""}.pdf`);
}
