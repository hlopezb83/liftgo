import { jsPDF } from "jspdf";
import { formatCurrency } from "@/lib/formatCurrency";
import { formatCurrencyWithCode } from "@/lib/formatCurrency";
import { applyDiscount } from "@/lib/invoiceUtils";
import type { CompanyData, PdfLineItem } from "@/lib/pdfShared";
import { fmtDate } from "@/lib/pdfShared";
import { format } from "date-fns";
import { nowMty } from "@/lib/utils";

// ─── Color Palette — Industrial Minimalist ────────────
export const GRAY_900 = { r: 17, g: 24, b: 39 };
const GRAY_700 = { r: 55, g: 65, b: 81 };
export const GRAY_500 = { r: 107, g: 114, b: 128 };
const GRAY_400 = { r: 156, g: 163, b: 175 };
export const GRAY_200 = { r: 229, g: 231, b: 235 };
const GRAY_100 = { r: 243, g: 244, b: 246 };
const GRAY_50 = { r: 249, g: 250, b: 251 };

// ─── Typography — 4 sizes only (quotes) ──────────────
const FONT_XL = 14;
const FONT_LG = 10;
const FONT_MD = 8;
const FONT_SM = 6.5;

export const MARGIN = 20;

// ─── PNG dimension helper ─────────────────────────────
function getPngDimensions(b64: string): { w: number; h: number } {
  try {
    const bin = atob(b64.replace(/^data:image\/\w+;base64,/, ""));
    const w =
      (bin.charCodeAt(16) << 24) |
      (bin.charCodeAt(17) << 16) |
      (bin.charCodeAt(18) << 8) |
      bin.charCodeAt(19);
    const h =
      (bin.charCodeAt(20) << 24) |
      (bin.charCodeAt(21) << 16) |
      (bin.charCodeAt(22) << 8) |
      bin.charCodeAt(23);
    if (w > 0 && h > 0) return { w, h };
  } catch { /* fall through */ }
  return { w: 1, h: 1 };
}

// fmtDate is now imported from @/lib/pdfShared

// ─── Accent Bar (kept for InvoicePDFButton compat) ────
export function drawAccentBar(doc: jsPDF): void {
  const pw = doc.internal.pageSize.getWidth();
  doc.setFillColor(GRAY_900.r, GRAY_900.g, GRAY_900.b);
  doc.rect(0, 0, pw, 3, "F");
}

// ─── Premium Header ──────────────────────────────────
export function drawPremiumHeader(
  doc: jsPDF,
  company: CompanyData | null,
  logoBase64: string | null,
  documentNumber: string,
  titleOrSaleFlag: boolean | string = false,
): number {
  const pw = doc.internal.pageSize.getWidth();
  let y = 14;

  // Determine document title
  let title: string;
  if (typeof titleOrSaleFlag === "string") {
    title = titleOrSaleFlag;
  } else if (titleOrSaleFlag === true) {
    title = "COTIZACIÓN DE VENTA";
  } else {
    title = "COTIZACIÓN";
  }

  // Left: Company logo — preserve original aspect ratio
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

  // Right: Document title
  doc.setFontSize(FONT_LG);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(GRAY_700.r, GRAY_700.g, GRAY_700.b);
  doc.text(title, pw - MARGIN, y, { align: "right" });

  // Document number — bold, dark, larger
  doc.setFontSize(FONT_XL);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(GRAY_900.r, GRAY_900.g, GRAY_900.b);
  doc.text(documentNumber, pw - MARGIN, y + 8, { align: "right" });

  // Date + validity
  doc.setFontSize(FONT_SM);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(GRAY_500.r, GRAY_500.g, GRAY_500.b);
  doc.text(`Fecha: ${format(nowMty(), "dd/MM/yyyy")}`, pw - MARGIN, y + 14, { align: "right" });

  y += 24;

  // Separator line
  doc.setDrawColor(GRAY_200.r, GRAY_200.g, GRAY_200.b);
  doc.setLineWidth(0.5);
  doc.line(MARGIN, y, pw - MARGIN, y);

  return y + 6;
}

// ─── Info Section — 2 columns: Emisor + Cliente ───────
export function drawInfoCardsAt(
  doc: jsPDF,
  startY: number,
  customerName: string | null,
  startDate: string | null,
  endDate: string | null,
  validUntil: string | null,
  isSale: boolean,
  customerRfc?: string | null,
  customerCp?: string | null,
  company?: CompanyData | null,
): number {
  const pw = doc.internal.pageSize.getWidth();
  const col1 = MARGIN;
  const col2 = pw / 2 + 4;

  // Row 1: Labels — EMISOR / CLIENTE
  const r1 = startY + 4;
  doc.setFontSize(FONT_SM);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(GRAY_500.r, GRAY_500.g, GRAY_500.b);
  doc.text("EMISOR", col1, r1);
  doc.text("CLIENTE", col2, r1);

  // Row 2: Names — bold, same size
  const r2 = startY + 10;
  doc.setFontSize(FONT_MD);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(GRAY_900.r, GRAY_900.g, GRAY_900.b);
  doc.text(company?.razon_social || "—", col1, r2);
  doc.text(customerName || "—", col2, r2);

  // Row 3: RFC
  const r3 = r2 + 5;
  doc.setFontSize(FONT_MD);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(GRAY_700.r, GRAY_700.g, GRAY_700.b);
  doc.text(company ? `RFC: ${company.rfc}` : "", col1, r3);
  doc.text(customerRfc ? `RFC: ${customerRfc}` : "", col2, r3);

  // Row 4: C.P.
  const r4 = r3 + 4;
  doc.text(company ? `C.P. ${company.lugar_expedicion}` : "", col1, r4);
  doc.text(customerCp ? `C.P. ${customerCp}` : "", col2, r4);

  // Row 5: Régimen / Período or Vigencia
  const r5 = r4 + 4;
  doc.text(company ? `Régimen: ${company.regimen_fiscal}` : "", col1, r5);
  if (!isSale && startDate && endDate) {
    doc.text(`Período: ${fmtDate(startDate)} — ${fmtDate(endDate)}`, col2, r5);
  } else if (validUntil) {
    doc.text(`Vigencia hasta: ${fmtDate(validUntil)}`, col2, r5);
  }

  // Row 6 (optional): Vigencia if rental already used row 5 for período
  let lastRow = r5;
  if (!isSale && startDate && endDate && validUntil) {
    const r6 = r5 + 4;
    doc.text(`Vigencia hasta: ${fmtDate(validUntil)}`, col2, r6);
    lastRow = r6;
  }

  return lastRow + 8;
}

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

  // Column positions
  const colDesc = MARGIN + 4;
  const colQty = MARGIN + tableWidth * (hasDiscount ? 0.50 : 0.62);
  const colUnit = MARGIN + tableWidth * (hasDiscount ? 0.65 : 0.78);
  const colDisc = MARGIN + tableWidth * 0.80;
  const colTotal = pw - MARGIN - 4;

  // Header row — light gray background
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

  // Thin separator below header
  doc.setDrawColor(GRAY_200.r, GRAY_200.g, GRAY_200.b);
  doc.setLineWidth(0.3);
  doc.line(MARGIN, y, pw - MARGIN, y);
  y += 3;

  // Rows
  const fmtC = currency ? (a: number) => formatCurrencyWithCode(a, currency) : formatCurrency;

  for (let i = 0; i < lineItems.length; i++) {
    const item = lineItems[i];
    const desc = String(item.description || "");

    // Parse description for bullet specs (lines starting with - or •)
    const descParts = desc.split("\n");
    const mainDesc = descParts[0] || desc;
    const specs = descParts.slice(1).filter(l => l.trim().length > 0);

    // Calculate row height based on content
    const baseRowH = 8;
    const specLineH = 3.5;
    const rowH = baseRowH + (specs.length > 0 ? specs.length * specLineH + 2 : 0);

    // Check page break
    const ph = doc.internal.pageSize.getHeight();
    if (y + rowH > ph - 40) {
      doc.addPage();
      drawAccentBar(doc);
      y = 16;
    }

    // Alternating row background
    if (i % 2 === 0) {
      doc.setFillColor(GRAY_50.r, GRAY_50.g, GRAY_50.b);
      doc.rect(MARGIN, y - 2, tableWidth, rowH, "F");
    }

    // Main description — bold
    const rowTextY = y + 5;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(FONT_MD);
    doc.setTextColor(GRAY_900.r, GRAY_900.g, GRAY_900.b);

    // Truncate main desc to fit column
    const maxDescW = colQty - colDesc - 8;
    const truncDesc = doc.splitTextToSize(mainDesc, maxDescW)[0] || mainDesc;
    doc.text(truncDesc, colDesc, rowTextY);

    // Spec bullets
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

    // Quantity
    doc.setFont("helvetica", "normal");
    doc.setFontSize(FONT_MD);
    doc.setTextColor(GRAY_700.r, GRAY_700.g, GRAY_700.b);
    doc.text(String(item.quantity), colQty, rowTextY, { align: "center" });

    // Unit price
    doc.text(fmtC(Number(item.unit_price)), colUnit + 8, rowTextY, { align: "right" });

    // Discount
    if (hasDiscount) {
      if (item.discount && item.discount > 0) {
        const discLabel = item.discount_type === "$" ? `-${fmtC(item.discount)}` : `-${item.discount}%`;
        doc.text(discLabel, colDisc + 4, rowTextY, { align: "right" });
      } else {
        doc.text("—", colDisc + 4, rowTextY, { align: "right" });
      }
    }

    // Total — bold, dark
    doc.setFont("helvetica", "bold");
    doc.setTextColor(GRAY_900.r, GRAY_900.g, GRAY_900.b);
    const netTotal = applyDiscount(item);
    doc.text(fmtC(netTotal), colTotal, rowTextY, { align: "right" });

    y += rowH;

    // Row separator
    doc.setDrawColor(GRAY_200.r, GRAY_200.g, GRAY_200.b);
    doc.setLineWidth(0.15);
    doc.line(MARGIN, y - 1, pw - MARGIN, y - 1);
  }

  return y + 4;
}

// ─── Bottom Section: Totals right, then Terms full-width ─
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

  // ── Totals (right-aligned) ──
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

  // Separator
  y += 5;
  doc.setDrawColor(GRAY_200.r, GRAY_200.g, GRAY_200.b);
  doc.setLineWidth(0.5);
  doc.line(labelX - 10, y, rightEdge, y);

  // Total
  y += 8;
  doc.setFontSize(FONT_LG);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(GRAY_900.r, GRAY_900.g, GRAY_900.b);
  doc.text("TOTAL:", labelX, y, { align: "right" });
  doc.setFontSize(FONT_XL);
  doc.text(`${fmtC(total)} ${currencyLabel}`, rightEdge, y, { align: "right" });

  y += 12;

  // ── Terms & Notes — full-width box ──
  const termsBoxX = MARGIN;
  const termsBoxW = pw - MARGIN * 2;

  // Build terms content
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

  // Calculate box height
  doc.setFontSize(FONT_SM);
  const termLineH = 3.5;
  let termsContentH = 10 + terms.length * termLineH;

  // Notes lines
  let noteLines: string[] = [];
  if (notes) {
    noteLines = doc.splitTextToSize(notes, termsBoxW - 12);
    termsContentH += 6 + noteLines.length * 3.5;
  }

  const boxH = Math.max(termsContentH + 8, 30);

  // Check page break
  const ph = doc.internal.pageSize.getHeight();
  if (y + boxH > ph - 20) {
    doc.addPage();
    drawAccentBar(doc);
    y = 16;
  }

  // Draw bg box
  doc.setFillColor(GRAY_50.r, GRAY_50.g, GRAY_50.b);
  doc.roundedRect(termsBoxX, y, termsBoxW, boxH, 2, 2, "F");

  // Title
  let ty = y + 8;
  doc.setFontSize(FONT_SM);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(GRAY_700.r, GRAY_700.g, GRAY_700.b);
  doc.text("TÉRMINOS, CONDICIONES Y NOTAS", termsBoxX + 6, ty);
  ty += 6;

  // Terms bullets
  doc.setFont("helvetica", "normal");
  doc.setTextColor(GRAY_500.r, GRAY_500.g, GRAY_500.b);
  for (const t of terms) {
    doc.text(`•  ${t}`, termsBoxX + 6, ty);
    ty += termLineH;
  }

  // Notes
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

// ─── Premium Totals (backward compat for InvoicePDF) ──
export function drawPremiumTotals(
  doc: jsPDF,
  startY: number,
  subtotal: number,
  taxRate: number,
  taxAmount: number,
  total: number,
  currency?: string,
): number {
  const fmtC = currency ? (a: number) => formatCurrencyWithCode(a, currency) : formatCurrency;
  const pw = doc.internal.pageSize.getWidth();
  let y = startY;
  const rightCol = pw - MARGIN - 4;
  const labelCol = rightCol - 55;

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(GRAY_500.r, GRAY_500.g, GRAY_500.b);
  doc.text("Subtotal:", labelCol, y, { align: "right" });
  doc.setTextColor(GRAY_900.r, GRAY_900.g, GRAY_900.b);
  doc.text(fmtC(subtotal), rightCol, y, { align: "right" });

  y += 7;
  doc.setTextColor(GRAY_500.r, GRAY_500.g, GRAY_500.b);
  doc.text(`IVA (${taxRate}%):`, labelCol, y, { align: "right" });
  doc.setTextColor(GRAY_900.r, GRAY_900.g, GRAY_900.b);
  doc.text(fmtC(taxAmount), rightCol, y, { align: "right" });

  y += 5;
  doc.setDrawColor(GRAY_200.r, GRAY_200.g, GRAY_200.b);
  doc.setLineWidth(0.3);
  doc.line(labelCol - 10, y, pw - MARGIN, y);

  y += 6;
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(GRAY_900.r, GRAY_900.g, GRAY_900.b);
  const currencyLabel = currency || "MXN";
  doc.text("TOTAL:", labelCol, y, { align: "right" });
  doc.setFontSize(14);
  doc.text(`${fmtC(total)} ${currencyLabel}`, rightCol, y, { align: "right" });

  return y + 8;
}

// ─── Notes Block (backward compat for InvoicePDF) ─────
export function drawPremiumNotes(
  doc: jsPDF,
  notes: string,
  startY: number,
): number {
  const pw = doc.internal.pageSize.getWidth();
  let y = startY + 4;

  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(GRAY_500.r, GRAY_500.g, GRAY_500.b);
  doc.text("NOTAS", MARGIN, y);
  y += 4;

  doc.setFillColor(GRAY_50.r, GRAY_50.g, GRAY_50.b);
  const textLines = doc.splitTextToSize(notes, pw - MARGIN * 2 - 12);
  const boxH = Math.max(14, textLines.length * 4.5 + 8);
  doc.roundedRect(MARGIN, y - 2, pw - MARGIN * 2, boxH, 2, 2, "F");

  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(GRAY_900.r, GRAY_900.g, GRAY_900.b);
  doc.text(textLines, MARGIN + 6, y + 5);

  return y + boxH + 4;
}

// ─── Terms Section (kept for backward compat) ─────────
export function drawTermsSection(
  doc: jsPDF,
  startY: number,
  validUntil: string | null,
  isRental: boolean = false,
  currency?: string,
): number {
  const pw = doc.internal.pageSize.getWidth();
  let y = startY + 2;

  doc.setDrawColor(GRAY_200.r, GRAY_200.g, GRAY_200.b);
  doc.setLineWidth(0.3);
  doc.line(MARGIN, y, pw - MARGIN, y);
  y += 7;

  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(GRAY_500.r, GRAY_500.g, GRAY_500.b);
  doc.text("TÉRMINOS Y CONDICIONES", MARGIN, y);
  y += 5;

  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  const currencyLabel = currency || "MXN";
  const terms = [
    `• Precios expresados en ${currencyLabel} antes de IVA salvo que se indique lo contrario.`,
    `• Esta cotización es válida hasta el ${fmtDate(validUntil)}.`,
    "• Condiciones de pago sujetas a negociación al momento de la contratación.",
    "• Los tiempos de entrega se confirman al aceptar la cotización.",
  ];

  if (isRental) {
    terms.push("• Equipo sujeto a 200 horas de uso mensual.");
    terms.push("• El uso de horas extras lleva un costo adicional.");
  }

  for (const t of terms) {
    doc.text(t, MARGIN, y);
    y += 4;
  }

  return y + 2;
}

// ─── Footer ──────────────────────────────────────────
export function drawFooter(
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
  doc.setTextColor(GRAY_400.r, GRAY_400.g, GRAY_400.b);

  const companyName = company?.razon_social || "LIFT GO";
  doc.text(`Documento generado electrónicamente — ${companyName}`, pw / 2, y + 5, { align: "center" });
}
