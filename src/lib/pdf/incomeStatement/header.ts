import type { jsPDF } from "jspdf";
import { format } from "date-fns";
import { nowMty } from "@/lib/utils";
import type { CompanyData } from "@/lib/pdf/shared";
import {
  GRAY_900, GRAY_700, GRAY_500, GRAY_200, GRAY_100,
  FONT_XL, FONT_LG, FONT_MD, FONT_SM, MARGIN,
  getPngDimensions,
} from "@/lib/pdf/quote/constants";

// ─── Document header (matches premium quote layout) ───
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
  const pw = doc.internal.pageSize.getWidth();
  const y = startY;

  // ─── Logo (left) ─────────────────────────────────
  if (logoBase64) {
    const maxH = 24;
    const maxW = 40;
    const { w: natW, h: natH } = getPngDimensions(logoBase64);
    const ratio = natW / natH;
    let logoW: number;
    let logoH: number;
    if (ratio >= 1) {
      logoW = Math.min(maxW, maxH * ratio);
      logoH = logoW / ratio;
    } else {
      logoH = maxH;
      logoW = maxH * ratio;
    }
    const logoY = y - 2 + (24 - logoH) / 2;
    doc.addImage(logoBase64, "PNG", MARGIN, logoY, logoW, logoH);
  }

  // ─── Company info (left, below/next to logo) ─────
  const infoX = MARGIN;
  const infoY = y + 14;
  if (company) {
    doc.setFontSize(FONT_SM);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(GRAY_500.r, GRAY_500.g, GRAY_500.b);
    doc.text(`${company.razon_social}`, infoX, infoY);
    doc.text(
      `RFC: ${company.rfc}  ·  Régimen: ${company.regimen_fiscal}  ·  C.P. ${company.lugar_expedicion}`,
      infoX,
      infoY + 4,
    );
  }

  // ─── Document title (right) ──────────────────────
  doc.setFontSize(FONT_LG);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(GRAY_700.r, GRAY_700.g, GRAY_700.b);
  doc.text("ESTADO DE RESULTADOS", pw - MARGIN, y, { align: "right" });

  const periodLabel = selectedYear === "all"
    ? `${format(startDate, "dd/MM/yyyy")} — ${format(endDate, "dd/MM/yyyy")}`
    : selectedYear === "compare"
      ? `Comparativo: ${availableYears.join(" vs ")}`
      : `Año ${selectedYear}`;

  doc.setFontSize(FONT_XL);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(GRAY_900.r, GRAY_900.g, GRAY_900.b);
  doc.text(periodLabel, pw - MARGIN, y + 8, { align: "right" });

  doc.setFontSize(FONT_SM);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(GRAY_500.r, GRAY_500.g, GRAY_500.b);
  doc.text(`Emitido: ${format(nowMty(), "dd/MM/yyyy")}`, pw - MARGIN, y + 14, { align: "right" });

  // ─── Separator ───────────────────────────────────
  const sepY = y + 24;
  doc.setDrawColor(GRAY_200.r, GRAY_200.g, GRAY_200.b);
  doc.setLineWidth(0.5);
  doc.line(MARGIN, sepY, pw - MARGIN, sepY);

  return sepY + 6;
}

// ─── Premium table header ─────────────────────────
export function drawTableHeader(
  doc: jsPDF,
  startY: number,
  colHeaders: string[],
  labelColW: number,
  colW: number,
): number {
  const pw = doc.internal.pageSize.getWidth();
  const tableWidth = pw - MARGIN * 2;
  const headerH = 9;

  doc.setFillColor(GRAY_100.r, GRAY_100.g, GRAY_100.b);
  doc.rect(MARGIN, startY, tableWidth, headerH, "F");

  doc.setFontSize(FONT_SM);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(GRAY_700.r, GRAY_700.g, GRAY_700.b);

  const textY = startY + 6;
  doc.text("CONCEPTO", MARGIN + 3, textY);
  colHeaders.forEach((h, i) => {
    doc.text(
      h.toUpperCase(),
      MARGIN + labelColW + colW * i + colW - 3,
      textY,
      { align: "right" },
    );
  });

  const lineY = startY + headerH;
  doc.setDrawColor(GRAY_200.r, GRAY_200.g, GRAY_200.b);
  doc.setLineWidth(0.3);
  doc.line(MARGIN, lineY, pw - MARGIN, lineY);

  doc.setFont("helvetica", "normal");
  return lineY + 3;
}

// ─── Footer (consistent with quote PDF) ───────────
export function drawIncomeStatementFooter(
  doc: jsPDF,
  company: CompanyData | null,
): void {
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const y = ph - 12;

  doc.setDrawColor(GRAY_200.r, GRAY_200.g, GRAY_200.b);
  doc.setLineWidth(0.3);
  doc.line(MARGIN, y, pw - MARGIN, y);

  doc.setFontSize(FONT_SM);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(156, 163, 175); // GRAY_400 inline

  const companyName = company?.razon_social || "LIFT GO";
  doc.text(
    `Estado de Resultados generado electrónicamente — ${companyName}`,
    pw / 2,
    y + 5,
    { align: "center" },
  );
}
