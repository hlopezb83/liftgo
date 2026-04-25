import { jsPDF } from "jspdf";
import { formatCurrency, formatCurrencyWithCode } from "@/lib/formatCurrency";
import { applyDiscount } from "@/lib/invoiceUtils";
import type { PdfLineItem } from "@/lib/pdf/shared";
import {
  GRAY_900, GRAY_700, GRAY_500, GRAY_200, GRAY_100, GRAY_50,
  FONT_MD, FONT_SM, MARGIN,
} from "./constants";
import { drawAccentBar } from "./header";

// ─── Premium Table ────────────────────────────────────
export function drawPremiumTable(
  doc: jsPDF,
  lineItems: PdfLineItem[],
  startY: number,
  currency?: string,
): number {
  const pw = doc.internal.pageSize.getWidth();
  const tableWidth = pw - MARGIN * 2;
  let y = startY;

  const hasDiscount = lineItems.some((item) => item.discount && item.discount > 0);

  const colDesc = MARGIN + 4;
  const colQty = MARGIN + tableWidth * (hasDiscount ? 0.50 : 0.62);
  const colUnit = MARGIN + tableWidth * (hasDiscount ? 0.65 : 0.78);
  const colDisc = MARGIN + tableWidth * 0.80;
  const colTotal = pw - MARGIN - 4;

  // Header row
  const headerH = 9;
  doc.setFillColor(GRAY_100.r, GRAY_100.g, GRAY_100.b);
  doc.rect(MARGIN, y, tableWidth, headerH, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(FONT_SM);
  doc.setTextColor(GRAY_700.r, GRAY_700.g, GRAY_700.b);
  const headerY = y + 6;
  doc.text("DESCRIPCIÓN", colDesc, headerY);
  doc.text("CANT.", colQty, headerY, { align: "center" });
  doc.text("P. UNITARIO", colUnit + 8, headerY, { align: "right" });
  if (hasDiscount) doc.text("DTO.", colDisc + 4, headerY, { align: "right" });
  doc.text("TOTAL", colTotal, headerY, { align: "right" });

  y += headerH;

  doc.setDrawColor(GRAY_200.r, GRAY_200.g, GRAY_200.b);
  doc.setLineWidth(0.3);
  doc.line(MARGIN, y, pw - MARGIN, y);
  y += 3;

  const fmtC = currency ? (a: number) => formatCurrencyWithCode(a, currency) : formatCurrency;

  for (let i = 0; i < lineItems.length; i++) {
    const item = lineItems[i];
    const desc = String(item.description || "");

    const descParts = desc.split("\n");
    const mainDesc = descParts[0] || desc;
    const specs = descParts.slice(1).filter(l => l.trim().length > 0);

    const baseRowH = 8;
    const specLineH = 3.5;
    const rowH = baseRowH + (specs.length > 0 ? specs.length * specLineH + 2 : 0);

    const ph = doc.internal.pageSize.getHeight();
    if (y + rowH > ph - 40) {
      doc.addPage();
      drawAccentBar(doc);
      y = 16;
    }

    if (i % 2 === 0) {
      doc.setFillColor(GRAY_50.r, GRAY_50.g, GRAY_50.b);
      doc.rect(MARGIN, y - 2, tableWidth, rowH, "F");
    }

    const rowTextY = y + 5;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(FONT_MD);
    doc.setTextColor(GRAY_900.r, GRAY_900.g, GRAY_900.b);

    const maxDescW = colQty - colDesc - 8;
    const truncDesc = doc.splitTextToSize(mainDesc, maxDescW)[0] || mainDesc;
    doc.text(truncDesc, colDesc, rowTextY);

    if (specs.length > 0) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(FONT_SM);
      doc.setTextColor(GRAY_500.r, GRAY_500.g, GRAY_500.b);
      let specY = rowTextY + 5;
      for (const spec of specs) {
        const cleanSpec = spec.replace(/^[-•]\s*/, "");
        const bulletText = `• ${cleanSpec}`;
        const specLines = doc.splitTextToSize(bulletText, maxDescW);
        doc.text(specLines[0], colDesc + 2, specY);
        specY += specLineH;
      }
    }

    doc.setFont("helvetica", "normal");
    doc.setFontSize(FONT_MD);
    doc.setTextColor(GRAY_700.r, GRAY_700.g, GRAY_700.b);
    doc.text(String(item.quantity), colQty, rowTextY, { align: "center" });

    doc.text(fmtC(Number(item.unit_price)), colUnit + 8, rowTextY, { align: "right" });

    if (hasDiscount) {
      if (item.discount && item.discount > 0) {
        const discLabel = item.discount_type === "$" ? `-${fmtC(item.discount)}` : `-${item.discount}%`;
        doc.text(discLabel, colDisc + 4, rowTextY, { align: "right" });
      } else {
        doc.text("—", colDisc + 4, rowTextY, { align: "right" });
      }
    }

    doc.setFont("helvetica", "bold");
    doc.setTextColor(GRAY_900.r, GRAY_900.g, GRAY_900.b);
    const netTotal = applyDiscount(item);
    doc.text(fmtC(netTotal), colTotal, rowTextY, { align: "right" });

    y += rowH;

    doc.setDrawColor(GRAY_200.r, GRAY_200.g, GRAY_200.b);
    doc.setLineWidth(0.15);
    doc.line(MARGIN, y - 1, pw - MARGIN, y - 1);
  }

  return y + 4;
}
