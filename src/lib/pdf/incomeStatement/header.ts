import type { jsPDF } from "jspdf";
import { format } from "date-fns";
import type { CompanyData } from "@/lib/pdf/shared";

export function drawIncomeStatementHeader(
  doc: jsPDF,
  startY: number,
  company: CompanyData | null,
  logoBase64: string | null,
  selectedYear: string,
  availableYears: string[],
  startDate: Date,
  endDate: Date,
): number {
  const margin = 14;
  const pageWidth = doc.internal.pageSize.getWidth();
  let y = startY;
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

  return y + 22;
}

export function drawTableHeader(
  doc: jsPDF,
  startY: number,
  colHeaders: string[],
  labelColW: number,
  colW: number,
): number {
  const margin = 14;
  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setFillColor(240, 240, 240);
  doc.rect(margin, startY - 4, pageWidth - margin * 2, 8, "F");
  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(51, 51, 51);
  doc.text("Concepto", margin + 2, startY);
  colHeaders.forEach((h, i) => {
    doc.text(h, margin + labelColW + colW * i + colW - 2, startY, { align: "right" });
  });

  let y = startY + 6;
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.3);
  doc.line(margin, y, pageWidth - margin, y);
  return y + 4;
}
