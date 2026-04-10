import { jsPDF } from "jspdf";
import { formatCurrency } from "@/lib/formatCurrency";
import { formatCurrencyWithCode } from "@/lib/formatCurrency";
import { applyDiscount } from "@/lib/invoiceUtils";
import type { CompanyData, PdfLineItem } from "@/lib/pdfHelpers";
import { format, parseISO } from "date-fns";
import { nowMty } from "@/lib/utils";

// ─── Color Palette — Industrial Minimalist ────────────
const GRAY_900 = { r: 17, g: 24, b: 39 };
const GRAY_700 = { r: 55, g: 65, b: 81 };
const GRAY_500 = { r: 107, g: 114, b: 128 };
const GRAY_400 = { r: 156, g: 163, b: 175 };
const GRAY_200 = { r: 229, g: 231, b: 235 };
const GRAY_100 = { r: 243, g: 244, b: 246 };
const GRAY_50 = { r: 249, g: 250, b: 251 };
const WHITE = { r: 255, g: 255, b: 255 };

// Legacy aliases for backward compat (InvoicePDFButton)
const NAVY = GRAY_900;
const NAVY_LIGHT = GRAY_700;
const GOLD = { r: 217, g: 165, b: 72 };
const GRAY_BG = GRAY_50;
const GRAY_BORDER = GRAY_200;
const GRAY_TEXT = GRAY_500;
const DARK_TEXT = GRAY_900;

const MARGIN = 20;

function fmtDate(d: string | null): string {
  if (!d) return "—";
  try { return format(parseISO(d), "dd/MM/yyyy"); } catch { return "—"; }
}

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

  // Left: Company name as logotype
  const logoSize = 16;
  let textStartX = MARGIN;
  if (logoBase64) {
    doc.addImage(logoBase64, "PNG", MARGIN, y - 2, logoSize, logoSize);
    textStartX = MARGIN + logoSize + 4;
  }

  const companyName = company?.razon_social || "LIFT GO MONTACARGAS";
  doc.setFontSize(15);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(GRAY_900.r, GRAY_900.g, GRAY_900.b);
  const maxNameW = pw / 2 - MARGIN - 4;
  const nameLines = doc.splitTextToSize(companyName, maxNameW);
  doc.text(nameLines, textStartX, y + 4);

  // Right: Document title in gray
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(GRAY_700.r, GRAY_700.g, GRAY_700.b);
  doc.text(title, pw - MARGIN, y, { align: "right" });

  // Document number — bold, dark
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(GRAY_900.r, GRAY_900.g, GRAY_900.b);
  doc.text(documentNumber, pw - MARGIN, y + 8, { align: "right" });

  // Date + validity
  doc.setFontSize(8);
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

// ─── Info Cards (kept for backward compat) ────────────
export function drawInfoCards(
  doc: jsPDF,
  customerName: string | null,
  startDate: string | null,
  endDate: string | null,
  validUntil: string | null,
  isSale: boolean,
): number {
  return 0;
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
  let y = startY;

  // ── Left: Emisor data ──
  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(GRAY_500.r, GRAY_500.g, GRAY_500.b);
  doc.text("EMISOR", MARGIN, y + 4);

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(GRAY_700.r, GRAY_700.g, GRAY_700.b);
  let ey = y + 10;
  if (company) {
    doc.text(company.razon_social, MARGIN, ey);
    ey += 5;
    doc.setFontSize(8);
    doc.text(`RFC: ${company.rfc}`, MARGIN, ey);
    ey += 4;
    doc.text(`C.P. ${company.lugar_expedicion}`, MARGIN, ey);
    ey += 4;
    doc.text(`Régimen: ${company.regimen_fiscal}`, MARGIN, ey);
  }

  // ── Right: Client data ──
  const midX = pw / 2 + 4;
  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(GRAY_500.r, GRAY_500.g, GRAY_500.b);
  doc.text("CLIENTE", midX, y + 4);

  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(GRAY_900.r, GRAY_900.g, GRAY_900.b);
  doc.text(customerName || "—", midX, y + 11);

  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(GRAY_700.r, GRAY_700.g, GRAY_700.b);
  let cy = y + 17;
  if (customerRfc) {
    doc.text(`RFC: ${customerRfc}`, midX, cy);
    cy += 4;
  }
  if (customerCp) {
    doc.text(`C.P. ${customerCp}`, midX, cy);
    cy += 4;
  }

  // Dates for rental
  if (!isSale && startDate && endDate) {
    doc.text(`Período: ${fmtDate(startDate)} — ${fmtDate(endDate)}`, midX, cy);
    cy += 4;
  }
  if (validUntil) {
    doc.text(`Vigencia hasta: ${fmtDate(validUntil)}`, midX, cy);
  }

  const maxY = Math.max(ey, cy);
  return maxY + 8;
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
  doc.setFontSize(7.5);
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
    doc.setFontSize(9);
    doc.setTextColor(GRAY_900.r, GRAY_900.g, GRAY_900.b);

    // Truncate main desc to fit column
    const maxDescW = colQty - colDesc - 8;
    const truncDesc = doc.splitTextToSize(mainDesc, maxDescW)[0] || mainDesc;
    doc.text(truncDesc, colDesc, rowTextY);

    // Spec bullets
    if (specs.length > 0) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
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
    doc.setFontSize(9);
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

// ─── Bottom Section: 2-col (Terms left, Totals right) ─
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

  const leftColW = pw / 2 - MARGIN - 4;
  const rightColStart = pw / 2 + 4;

  // ── LEFT: Terms, Conditions & Notes box ──
  const termsBoxX = MARGIN;
  const termsBoxW = leftColW;

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
  doc.setFontSize(7);
  const termLineH = 4;
  let termsContentH = 10 + terms.length * termLineH; // header + terms
  
  // Notes lines
  let noteLines: string[] = [];
  if (notes) {
    doc.setFontSize(7);
    noteLines = doc.splitTextToSize(notes, termsBoxW - 12);
    termsContentH += 6 + noteLines.length * 3.5;
  }

  const boxH = Math.max(termsContentH + 8, 50);

  // Draw bg box
  doc.setFillColor(GRAY_50.r, GRAY_50.g, GRAY_50.b);
  doc.roundedRect(termsBoxX, y, termsBoxW, boxH, 2, 2, "F");

  // Title
  let ty = y + 8;
  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(GRAY_700.r, GRAY_700.g, GRAY_700.b);
  doc.text("TÉRMINOS, CONDICIONES Y NOTAS", termsBoxX + 6, ty);
  ty += 6;

  // Terms bullets
  doc.setFontSize(7);
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

  // ── RIGHT: Totals ──
  let ry = y + 8;
  const rightEdge = pw - MARGIN;
  const labelX = rightEdge - 52;

  // Subtotal
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(GRAY_500.r, GRAY_500.g, GRAY_500.b);
  doc.text("Subtotal:", labelX, ry, { align: "right" });
  doc.setTextColor(GRAY_900.r, GRAY_900.g, GRAY_900.b);
  doc.text(fmtC(subtotal), rightEdge, ry, { align: "right" });

  ry += 7;
  doc.setTextColor(GRAY_500.r, GRAY_500.g, GRAY_500.b);
  doc.text(`IVA (${taxRate}%):`, labelX, ry, { align: "right" });
  doc.setTextColor(GRAY_900.r, GRAY_900.g, GRAY_900.b);
  doc.text(fmtC(taxAmount), rightEdge, ry, { align: "right" });

  // Separator
  ry += 5;
  doc.setDrawColor(GRAY_200.r, GRAY_200.g, GRAY_200.b);
  doc.setLineWidth(0.5);
  doc.line(rightColStart, ry, rightEdge, ry);

  // Total
  ry += 8;
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(GRAY_900.r, GRAY_900.g, GRAY_900.b);
  doc.text("TOTAL:", labelX, ry, { align: "right" });
  doc.setFontSize(14);
  doc.text(`${fmtC(total)} ${currencyLabel}`, rightEdge, ry, { align: "right" });

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
  // This is now handled by drawBottomSection for quotes.
  // Kept for any standalone usage.
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

  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(GRAY_400.r, GRAY_400.g, GRAY_400.b);

  const companyName = company?.razon_social || "LIFT GO";
  doc.text(`Documento generado electrónicamente — ${companyName}`, pw / 2, y + 5, { align: "center" });
}
