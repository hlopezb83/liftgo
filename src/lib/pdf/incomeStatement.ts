import type { jsPDF } from "jspdf";
import { fetchCompanyDataAndLogo } from "@/lib/pdf/shared";
import type { StatementRow, ComparisonRow, YearTotals, MonthData } from "@/features/reports/hooks/useIncomeStatementData";
import { MARGIN } from "@/lib/pdf/quote/constants";
import { drawAccentBar } from "@/lib/pdf/quote/header";
import {
  drawIncomeStatementHeader,
  drawTableHeader,
  drawIncomeStatementFooter,
} from "./incomeStatement/header";
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

  const doc: jsPDF = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // ─── Page 1 setup ────────────────────────────────
  drawAccentBar(doc);
  let y = drawIncomeStatementHeader(
    doc, 16, company, logoBase64,
    selectedYear, availableYears, startDate, endDate,
  );

  // ─── Column geometry ─────────────────────────────
  const rows = isComparison ? comparisonRows : statementRows;
  const colHeaders = isComparison
    ? [...yearTotals.map((yt) => yt.year), "Var. $", "Var. %"]
    : [...filteredData.map((d) => d.month), "Total"];

  const labelColW = 60;
  const availableW = pageWidth - MARGIN * 2 - labelColW;
  const colW = Math.min(availableW / colHeaders.length, 30);

  y = drawTableHeader(doc, y, colHeaders, labelColW, colW);

  // ─── Rows ────────────────────────────────────────
  const rowH = 6;
  const bottomLimit = pageHeight - 18; // leave room for footer

  for (let i = 0; i < rows.length; i++) {
    if (y + rowH > bottomLimit) {
      // finish current page footer + new page
      drawIncomeStatementFooter(doc, company);
      doc.addPage();
      drawAccentBar(doc);
      y = drawIncomeStatementHeader(
        doc, 16, company, logoBase64,
        selectedYear, availableYears, startDate, endDate,
      );
      y = drawTableHeader(doc, y, colHeaders, labelColW, colW);
    }

    drawStatementRow({
      doc,
      row: rows[i],
      y: y + 4,
      rowIndex: i,
      labelColW,
      colW,
      isComparison,
    });
    y += rowH;
  }

  // ─── Footer on last page ─────────────────────────
  drawIncomeStatementFooter(doc, company);

  doc.save(`estado-resultados${selectedYear !== "all" ? `-${selectedYear}` : ""}.pdf`);
}
