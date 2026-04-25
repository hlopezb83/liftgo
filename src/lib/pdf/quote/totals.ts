import { jsPDF } from "jspdf";
import { formatCurrency, formatCurrencyWithCode } from "@/lib/formatCurrency";
import { fmtDate } from "@/lib/pdf/shared";
import {
  GRAY_900, GRAY_700, GRAY_500, GRAY_200, GRAY_50,
  FONT_XL, FONT_LG, FONT_MD, FONT_SM, MARGIN,
} from "./constants";
import { drawAccentBar } from "./header";

// ─── Bottom Section: Totals + Terms/Notes ─────────────
export function drawBottomSection(
  doc: jsPDF,
  startY: number,
  subtotal: number,
  taxRate: number,
  taxAmount: number,
  total: number,
  currency?: string,
  notes?: string | null,
  validUntil?: string | null,
  isRental?: boolean,
): number {
  const pw = doc.internal.pageSize.getWidth();
  const fmtC = currency ? (a: number) => formatCurrencyWithCode(a, currency) : formatCurrency;
  const currencyLabel = currency || "MXN";
  let y = startY;

  const rightEdge = pw - MARGIN;
  const labelX = rightEdge - 52;

  // Totals
  doc.setFontSize(FONT_MD);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(GRAY_500.r, GRAY_500.g, GRAY_500.b);
  doc.text("Subtotal:", labelX, y, { align: "right" });
  doc.setTextColor(GRAY_900.r, GRAY_900.g, GRAY_900.b);
  doc.text(fmtC(subtotal), rightEdge, y, { align: "right" });

  y += 7;
  doc.setTextColor(GRAY_500.r, GRAY_500.g, GRAY_500.b);
  doc.text(`IVA (${taxRate}%):`, labelX, y, { align: "right" });
  doc.setTextColor(GRAY_900.r, GRAY_900.g, GRAY_900.b);
  doc.text(fmtC(taxAmount), rightEdge, y, { align: "right" });

  y += 5;
  doc.setDrawColor(GRAY_200.r, GRAY_200.g, GRAY_200.b);
  doc.setLineWidth(0.5);
  doc.line(labelX - 10, y, rightEdge, y);

  y += 8;
  doc.setFontSize(FONT_LG);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(GRAY_900.r, GRAY_900.g, GRAY_900.b);
  doc.text("TOTAL:", labelX, y, { align: "right" });
  doc.setFontSize(FONT_XL);
  doc.text(`${fmtC(total)} ${currencyLabel}`, rightEdge, y, { align: "right" });

  y += 12;

  // Terms & notes box
  const termsBoxX = MARGIN;
  const termsBoxW = pw - MARGIN * 2;

  const terms: string[] = [
    `Precios expresados en ${currencyLabel} antes de IVA.`,
    `Cotización válida hasta el ${fmtDate(validUntil)}.`,
    "Condiciones de pago sujetas a negociación.",
    "Tiempos de entrega confirmados al aceptar.",
  ];
  if (isRental) {
    terms.push("Equipo sujeto a 200 horas de uso mensual.");
    terms.push("Horas extras con costo adicional.");
  }

  doc.setFontSize(FONT_SM);
  const termLineH = 3.5;
  let termsContentH = 10 + terms.length * termLineH;

  let noteLines: string[] = [];
  if (notes) {
    noteLines = doc.splitTextToSize(notes, termsBoxW - 12);
    termsContentH += 6 + noteLines.length * 3.5;
  }

  const boxH = Math.max(termsContentH + 8, 30);

  const ph = doc.internal.pageSize.getHeight();
  if (y + boxH > ph - 20) {
    doc.addPage();
    drawAccentBar(doc);
    y = 16;
  }

  doc.setFillColor(GRAY_50.r, GRAY_50.g, GRAY_50.b);
  doc.roundedRect(termsBoxX, y, termsBoxW, boxH, 2, 2, "F");

  let ty = y + 8;
  doc.setFontSize(FONT_SM);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(GRAY_700.r, GRAY_700.g, GRAY_700.b);
  doc.text("TÉRMINOS, CONDICIONES Y NOTAS", termsBoxX + 6, ty);
  ty += 6;

  doc.setFont("helvetica", "normal");
  doc.setTextColor(GRAY_500.r, GRAY_500.g, GRAY_500.b);
  for (const t of terms) {
    doc.text(`•  ${t}`, termsBoxX + 6, ty);
    ty += termLineH;
  }

  if (notes && noteLines.length > 0) {
    ty += 3;
    doc.setFont("helvetica", "bold");
    doc.setTextColor(GRAY_700.r, GRAY_700.g, GRAY_700.b);
    doc.text("Notas:", termsBoxX + 6, ty);
    ty += 4;
    doc.setFont("helvetica", "normal");
    doc.setTextColor(GRAY_500.r, GRAY_500.g, GRAY_500.b);
    for (const nl of noteLines) {
      doc.text(nl, termsBoxX + 6, ty);
      ty += 3.5;
    }
  }

  return y + boxH + 4;
}

// ─── Footer ──────────────────────────────────────────
export function drawFooter(
  doc: jsPDF,
  company: { razon_social?: string | null } | null,
): void {
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const y = ph - 12;

  doc.setDrawColor(GRAY_200.r, GRAY_200.g, GRAY_200.b);
  doc.setLineWidth(0.3);
  doc.line(MARGIN, y, pw - MARGIN, y);

  doc.setFontSize(FONT_SM);
  doc.setFont("helvetica", "normal");
  // GRAY_400 inlined to avoid extra import
  doc.setTextColor(156, 163, 175);

  const companyName = company?.razon_social || "LIFT GO";
  doc.text(`Documento generado electrónicamente — ${companyName}`, pw / 2, y + 5, { align: "center" });
}
