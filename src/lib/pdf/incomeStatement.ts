import type { jsPDF } from "jspdf";
import { formatCurrency } from "@/lib/formatCurrency";
import { fetchCompanyDataAndLogo } from "@/lib/pdfShared";
import type { StatementRow, ComparisonRow, YearTotals, MonthData } from "@/hooks/useIncomeStatementData";

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
  const { format } = await import("date-fns");
  const { company, logoBase64 } = await fetchCompanyDataAndLogo();

  const doc: jsPDF = new jsPDF({ orientation: "landscape" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 14;
  let y = 16;

  // Header with logo
  const textStartX = logoBase64 ? margin + 22 : margin;
  if (logoBase64) {
    doc.addImage(logoBase64, "PNG", margin, y - 4, 18, 18);
  }
  doc.setFontSize(16);
  doc.setTextColor(232, 89, 12);
  doc.text(company?.razon_social || "LiftGo", textStartX, y);
  doc.setFontSize(8);
  doc.setTextColor(102, 102, 102);
  if (company) {
    doc.text(`RFC: ${company.rfc} | ${company.regimen_fiscal} | C.P.: ${company.lugar_expedicion}`, textStartX, y + 5);
  }

  doc.setFontSize(14);
  doc.setTextColor(51, 51, 51);
  doc.text("Estado de Resultados", pageWidth - margin, y, { align: "right" });
  doc.setFontSize(9);
  const periodLabel = selectedYear === "all"
    ? `${format(startDate, "dd/MM/yyyy")} — ${format(endDate, "dd/MM/yyyy")}`
    : selectedYear === "compare"
      ? `Comparativo: ${availableYears.join(" vs ")}`
      : `Año ${selectedYear}`;
  doc.text(periodLabel, pageWidth - margin, y + 6, { align: "right" });

  y += 22;

  // Determine columns
  const rows = isComparison ? comparisonRows : statementRows;
  const colHeaders = isComparison
    ? [...yearTotals.map((yt) => yt.year), "Var. $", "Var. %"]
    : [...filteredData.map((d) => d.month), "Total"];

  const labelColW = 50;
  const availableW = pageWidth - margin * 2 - labelColW;
  const colW = Math.min(availableW / colHeaders.length, 28);

  // Table header
  doc.setFillColor(240, 240, 240);
  doc.rect(margin, y - 4, pageWidth - margin * 2, 8, "F");
  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(51, 51, 51);
  doc.text("Concepto", margin + 2, y);
  colHeaders.forEach((h, i) => {
    doc.text(h, margin + labelColW + colW * i + colW - 2, y, { align: "right" });
  });

  y += 6;
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.3);
  doc.line(margin, y, pageWidth - margin, y);
  y += 4;

  // Rows
  doc.setFontSize(7);
  for (const row of rows) {
    if (y > doc.internal.pageSize.getHeight() - 15) {
      doc.addPage();
      y = 16;
    }

    if (row.isSubtotal) {
      doc.setFillColor(245, 245, 245);
      doc.rect(margin, y - 3.5, pageWidth - margin * 2, 6, "F");
      doc.setFont("helvetica", "bold");
    } else {
      doc.setFont("helvetica", "normal");
    }

    doc.setTextColor(51, 51, 51);
    doc.text(row.label, margin + 2, y);

    if (isComparison) {
      const cr = row as ComparisonRow;
      cr.yearValues.forEach((val, i) => {
        if (cr.isCost || (cr.label === "= Utilidad Neta" && val < 0)) doc.setTextColor(220, 50, 50);
        else doc.setTextColor(51, 51, 51);
        const txt = cr.isPercent ? `${val.toFixed(1)}%` : formatCurrency(val);
        doc.text(txt, margin + labelColW + colW * i + colW - 2, y, { align: "right" });
      });
      const deltaIdx = cr.yearValues.length;
      doc.setTextColor(cr.delta >= 0 ? 34 : 220, cr.delta >= 0 ? 139 : 50, cr.delta >= 0 ? 34 : 50);
      const deltaTxt = cr.isPercent ? `${cr.delta >= 0 ? "+" : ""}${cr.delta.toFixed(1)} pp` : `${cr.delta >= 0 ? "+" : ""}${formatCurrency(cr.delta)}`;
      doc.text(deltaTxt, margin + labelColW + colW * deltaIdx + colW - 2, y, { align: "right" });
      const pctTxt = cr.deltaPct !== null ? `${cr.deltaPct >= 0 ? "+" : ""}${cr.deltaPct.toFixed(1)}%` : "—";
      if (cr.deltaPct !== null) doc.setTextColor(cr.deltaPct >= 0 ? 34 : 220, cr.deltaPct >= 0 ? 139 : 50, cr.deltaPct >= 0 ? 34 : 50);
      else doc.setTextColor(150, 150, 150);
      doc.text(pctTxt, margin + labelColW + colW * (deltaIdx + 1) + colW - 2, y, { align: "right" });
    } else {
      const sr = row as StatementRow;
      sr.values.forEach((val, i) => {
        if (sr.isCost || (sr.label === "= Utilidad Neta" && val < 0)) doc.setTextColor(220, 50, 50);
        else doc.setTextColor(51, 51, 51);
        const txt = sr.isPercent ? `${val.toFixed(1)}%` : formatCurrency(val);
        doc.text(txt, margin + labelColW + colW * i + colW - 2, y, { align: "right" });
      });
      const totalIdx = sr.values.length;
      doc.setFont("helvetica", "bold");
      if (sr.isCost || (sr.label === "= Utilidad Neta" && sr.total < 0)) doc.setTextColor(220, 50, 50);
      else doc.setTextColor(51, 51, 51);
      const totalTxt = sr.isPercent ? `${sr.total.toFixed(1)}%` : formatCurrency(sr.total);
      doc.text(totalTxt, margin + labelColW + colW * totalIdx + colW - 2, y, { align: "right" });
    }

    y += 2;
    doc.setDrawColor(230, 230, 230);
    doc.setLineWidth(0.15);
    doc.line(margin, y, pageWidth - margin, y);
    y += 4;
  }

  doc.save(`estado-resultados${selectedYear !== "all" ? `-${selectedYear}` : ""}.pdf`);
}
