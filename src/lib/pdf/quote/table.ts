import { jsPDF } from "jspdf";
import { formatCurrency, formatCurrencyWithCode } from "@/lib/formatCurrency";
import { applyDiscount } from "@/lib/domain/invoiceHelpers";
import type { PdfLineItem } from "@/lib/pdf/shared";
import {
  GRAY_900, GRAY_700, GRAY_500, GRAY_200, GRAY_100, GRAY_50,
  FONT_MD, FONT_SM, MARGIN,
} from "./constants";
import { drawAccentBar } from "./header";

interface ColumnLayout {
  desc: number;
  qty: number;
  unit: number;
  disc: number;
  total: number;
  hasDiscount: boolean;
  tableWidth: number;
}

function computeColumns(doc: jsPDF, hasDiscount: boolean): ColumnLayout {
  const pw = doc.internal.pageSize.getWidth();
  const tableWidth = pw - MARGIN * 2;
  return {
    desc: MARGIN + 4,
    qty: MARGIN + tableWidth * (hasDiscount ? 0.50 : 0.62),
    unit: MARGIN + tableWidth * (hasDiscount ? 0.65 : 0.78),
    disc: MARGIN + tableWidth * 0.80,
    total: pw - MARGIN - 4,
    hasDiscount,
    tableWidth,
  };
}

function drawTableHeader(doc: jsPDF, y: number, cols: ColumnLayout): number {
  const headerH = 9;
  doc.setFillColor(GRAY_100.r, GRAY_100.g, GRAY_100.b);
  doc.rect(MARGIN, y, cols.tableWidth, headerH, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(FONT_SM);
  doc.setTextColor(GRAY_700.r, GRAY_700.g, GRAY_700.b);
  const headerY = y + 6;
  doc.text("DESCRIPCIÓN", cols.desc, headerY);
  doc.text("CANT.", cols.qty, headerY, { align: "center" });
  doc.text("P. UNITARIO", cols.unit + 8, headerY, { align: "right" });
  if (cols.hasDiscount) doc.text("DTO.", cols.disc + 4, headerY, { align: "right" });
  doc.text("TOTAL", cols.total, headerY, { align: "right" });

  const newY = y + headerH;
  const pw = doc.internal.pageSize.getWidth();
  doc.setDrawColor(GRAY_200.r, GRAY_200.g, GRAY_200.b);
  doc.setLineWidth(0.3);
  doc.line(MARGIN, newY, pw - MARGIN, newY);
  return newY + 3;
}

function drawDescription(
  doc: jsPDF, mainDesc: string, specs: string[], cols: ColumnLayout, rowTextY: number,
): void {
  const maxDescW = cols.qty - cols.desc - 8;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(FONT_MD);
  doc.setTextColor(GRAY_900.r, GRAY_900.g, GRAY_900.b);
  const truncDesc = doc.splitTextToSize(mainDesc, maxDescW)[0] || mainDesc;
  doc.text(truncDesc, cols.desc, rowTextY);

  if (specs.length === 0) return;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(FONT_SM);
  doc.setTextColor(GRAY_500.r, GRAY_500.g, GRAY_500.b);
  let specY = rowTextY + 5;
  for (const spec of specs) {
    const cleanSpec = spec.replace(/^[-•]\s*/, "");
    const bulletText = `• ${cleanSpec}`;
    const specLines = doc.splitTextToSize(bulletText, maxDescW);
    doc.text(specLines[0], cols.desc + 2, specY);
    specY += 3.5;
  }
}

function drawRow(
  doc: jsPDF, item: PdfLineItem, index: number, y: number, cols: ColumnLayout,
  fmtC: (n: number) => string,
): number {
  const desc = String(item.description || "");
  const descParts = desc.split("\n");
  const mainDesc = descParts[0] || desc;
  const specs = descParts.slice(1).filter((l) => l.trim().length > 0);

  const baseRowH = 8;
  const specLineH = 3.5;
  const rowH = baseRowH + (specs.length > 0 ? specs.length * specLineH + 2 : 0);

  // Salto de página si no cabe la fila.
  let workingY = y;
  const ph = doc.internal.pageSize.getHeight();
  if (workingY + rowH > ph - 40) {
    doc.addPage();
    drawAccentBar(doc);
    workingY = 16;
  }

  if (index % 2 === 0) {
    doc.setFillColor(GRAY_50.r, GRAY_50.g, GRAY_50.b);
    doc.rect(MARGIN, workingY - 2, cols.tableWidth, rowH, "F");
  }

  const rowTextY = workingY + 5;
  drawDescription(doc, mainDesc, specs, cols, rowTextY);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(FONT_MD);
  doc.setTextColor(GRAY_700.r, GRAY_700.g, GRAY_700.b);
  doc.text(String(item.quantity), cols.qty, rowTextY, { align: "center" });
  doc.text(fmtC(Number(item.unit_price)), cols.unit + 8, rowTextY, { align: "right" });

  if (cols.hasDiscount) {
    const label = item.discount && item.discount > 0
      ? (item.discount_type === "$" ? `-${fmtC(item.discount)}` : `-${item.discount}%`)
      : "—";
    doc.text(label, cols.disc + 4, rowTextY, { align: "right" });
  }

  doc.setFont("helvetica", "bold");
  doc.setTextColor(GRAY_900.r, GRAY_900.g, GRAY_900.b);
  doc.text(fmtC(applyDiscount(item)), cols.total, rowTextY, { align: "right" });

  const newY = workingY + rowH;
  const pw = doc.internal.pageSize.getWidth();
  doc.setDrawColor(GRAY_200.r, GRAY_200.g, GRAY_200.b);
  doc.setLineWidth(0.15);
  doc.line(MARGIN, newY - 1, pw - MARGIN, newY - 1);
  return newY;
}

export function drawPremiumTable(
  doc: jsPDF,
  lineItems: PdfLineItem[],
  startY: number,
  currency?: string,
): number {
  const hasDiscount = lineItems.some((item) => item.discount && item.discount > 0);
  const cols = computeColumns(doc, hasDiscount);
  const fmtC = currency ? (a: number) => formatCurrencyWithCode(a, currency) : formatCurrency;

  let y = drawTableHeader(doc, startY, cols);
  for (let i = 0; i < lineItems.length; i++) {
    y = drawRow(doc, lineItems[i], i, y, cols, fmtC);
  }
  return y + 4;
}
