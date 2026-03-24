import { jsPDF } from "jspdf";
import { formatCurrency } from "@/lib/formatCurrency";
import { formatCurrencyWithCode } from "@/lib/formatCurrency";
import { applyDiscount } from "@/lib/invoiceUtils";
import type { CompanyData, PdfLineItem } from "@/lib/pdfHelpers";
import { format, parseISO } from "date-fns";

// ─── Brand Colors ─────────────────────────────────────
const NAVY = { r: 15, g: 23, b: 42 };       // slate-900
const NAVY_LIGHT = { r: 30, g: 41, b: 59 }; // slate-800
const GOLD = { r: 217, g: 165, b: 72 };      // accent gold
const GRAY_BG = { r: 248, g: 250, b: 252 };  // slate-50
const GRAY_BORDER = { r: 226, g: 232, b: 240 }; // slate-200
const GRAY_TEXT = { r: 100, g: 116, b: 139 }; // slate-500
const DARK_TEXT = { r: 15, g: 23, b: 42 };    // slate-900
const WHITE = { r: 255, g: 255, b: 255 };

const MARGIN = 20;

function fmtDate(d: string | null): string {
  if (!d) return "—";
  try { return format(parseISO(d), "dd/MM/yyyy"); } catch { return "—"; }
}

// ─── Accent Bar ───────────────────────────────────────
export function drawAccentBar(doc: jsPDF): void {
  const pw = doc.internal.pageSize.getWidth();
  doc.setFillColor(NAVY.r, NAVY.g, NAVY.b);
  doc.rect(0, 0, pw, 8, "F");
  // Gold thin line below
  doc.setFillColor(GOLD.r, GOLD.g, GOLD.b);
  doc.rect(0, 8, pw, 1.5, "F");
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
  let y = 18;
  
  // Determine document title
  let title: string;
  if (typeof titleOrSaleFlag === "string") {
    title = titleOrSaleFlag;
  } else if (titleOrSaleFlag === true) {
    title = "COTIZACIÓN DE VENTA";
  } else {
    title = "COTIZACIÓN";
  }

  // Logo
  const logoSize = 20;
  const textStartX = logoBase64 ? MARGIN + logoSize + 6 : MARGIN;
  if (logoBase64) {
    doc.addImage(logoBase64, "PNG", MARGIN, y, logoSize, logoSize);
  }

  // Company name — limited width to avoid overlap with title
  const maxNameWidth = pw / 2 - MARGIN - 4;
  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(DARK_TEXT.r, DARK_TEXT.g, DARK_TEXT.b);
  const nameLines = doc.splitTextToSize(company?.razon_social || "LiftGo", maxNameWidth);
  doc.text(nameLines, textStartX, y + 5);

  // RFC line
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(GRAY_TEXT.r, GRAY_TEXT.g, GRAY_TEXT.b);
  if (company) {
    doc.text(`RFC: ${company.rfc}  •  C.P. ${company.lugar_expedicion}`, textStartX, y + 12);
  }

  // Right side: document title
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(NAVY.r, NAVY.g, NAVY.b);
  doc.text(title, pw - MARGIN, y + 2, { align: "right" });

  // Document number
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(GOLD.r, GOLD.g, GOLD.b);
  doc.text(documentNumber, pw - MARGIN, y + 9, { align: "right" });

  // Date
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(GRAY_TEXT.r, GRAY_TEXT.g, GRAY_TEXT.b);
  doc.text(`Fecha: ${format(new Date(), "dd/MM/yyyy")}`, pw - MARGIN, y + 15, { align: "right" });

  y += 28;

  // Separator line
  doc.setDrawColor(GRAY_BORDER.r, GRAY_BORDER.g, GRAY_BORDER.b);
  doc.setLineWidth(0.5);
  doc.line(MARGIN, y, pw - MARGIN, y);

  return y + 8;
}

// ─── Info Cards (Client + Details) ────────────────────
export function drawInfoCards(
  doc: jsPDF,
  customerName: string | null,
  startDate: string | null,
  endDate: string | null,
  validUntil: string | null,
  isSale: boolean,
): number {
  const pw = doc.internal.pageSize.getWidth();
  const cardWidth = (pw - MARGIN * 2 - 8) / 2;
  const cardHeight = 28;
  let y = 0; // will be set by caller via startY param — let's refactor

  return y;
}

// Proper version with startY
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
): number {
  const pw = doc.internal.pageSize.getWidth();
  const cardWidth = (pw - MARGIN * 2 - 8) / 2;
  const clientCardH = 34;
  let y = startY;

  // ── Client Card ──
  doc.setFillColor(GRAY_BG.r, GRAY_BG.g, GRAY_BG.b);
  doc.roundedRect(MARGIN, y, cardWidth, clientCardH, 2, 2, "F");

  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(GRAY_TEXT.r, GRAY_TEXT.g, GRAY_TEXT.b);
  doc.text("CLIENTE", MARGIN + 6, y + 7);

  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(DARK_TEXT.r, DARK_TEXT.g, DARK_TEXT.b);
  doc.text(customerName || "—", MARGIN + 6, y + 15);

  // RFC & C.P.
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(GRAY_TEXT.r, GRAY_TEXT.g, GRAY_TEXT.b);
  const rfcLine = [customerRfc ? `RFC: ${customerRfc}` : null, customerCp ? `C.P. ${customerCp}` : null].filter(Boolean).join("  •  ");
  if (rfcLine) {
    doc.text(rfcLine, MARGIN + 6, y + 22);
  }

  // ── Details Card ──
  const cardX = MARGIN + cardWidth + 8;
  doc.setFillColor(GRAY_BG.r, GRAY_BG.g, GRAY_BG.b);
  doc.roundedRect(cardX, y, cardWidth, clientCardH, 2, 2, "F");

  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(GRAY_TEXT.r, GRAY_TEXT.g, GRAY_TEXT.b);
  doc.text("DETALLES", cardX + 6, y + 7);

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(DARK_TEXT.r, DARK_TEXT.g, DARK_TEXT.b);

  if (!isSale && startDate && endDate) {
    doc.setFont("helvetica", "bold");
    doc.text("Inicio:", cardX + 6, y + 15);
    doc.setFont("helvetica", "normal");
    doc.text(fmtDate(startDate), cardX + 22, y + 15);

    doc.setFont("helvetica", "bold");
    doc.text("Fin:", cardX + 50, y + 15);
    doc.setFont("helvetica", "normal");
    doc.text(fmtDate(endDate), cardX + 60, y + 15);

    doc.setFont("helvetica", "bold");
    doc.text("Vigencia hasta:", cardX + 6, y + 22);
    doc.setFont("helvetica", "normal");
    doc.text(fmtDate(validUntil), cardX + 38, y + 22);
  } else {
    doc.setFont("helvetica", "bold");
    doc.text("Vigencia hasta:", cardX + 6, y + 16);
    doc.setFont("helvetica", "normal");
    doc.text(fmtDate(validUntil), cardX + 38, y + 16);
  }

  return y + clientCardH + 8;
}

// ─── Premium Table ────────────────────────────────────
export function drawPremiumTable(
  doc: jsPDF,
  lineItems: PdfLineItem[],
  startY: number,
): number {
  const pw = doc.internal.pageSize.getWidth();
  const tableWidth = pw - MARGIN * 2;
  let y = startY;

  const hasDiscount = lineItems.some((item) => item.discount && item.discount > 0);

  // Column positions — adjust if discount column present
  const colDesc = MARGIN + 4;
  const colQty = MARGIN + tableWidth * (hasDiscount ? 0.48 : 0.6);
  const colUnit = MARGIN + tableWidth * (hasDiscount ? 0.62 : 0.75);
  const colDisc = MARGIN + tableWidth * 0.78;
  const colTotal = pw - MARGIN - 4;

  // Header row
  const headerH = 10;
  doc.setFillColor(NAVY.r, NAVY.g, NAVY.b);
  doc.roundedRect(MARGIN, y, tableWidth, headerH, 1.5, 1.5, "F");
  doc.rect(MARGIN, y + headerH - 2, tableWidth, 2, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(WHITE.r, WHITE.g, WHITE.b);
  const headerY = y + 7;
  doc.text("DESCRIPCIÓN", colDesc, headerY);
  doc.text("CANT.", colQty, headerY, { align: "right" });
  doc.text("P. UNITARIO", colUnit + 14, headerY, { align: "right" });
  if (hasDiscount) doc.text("DTO.", colDisc + 6, headerY, { align: "right" });
  doc.text("TOTAL", colTotal, headerY, { align: "right" });

  y += headerH + 2;

  // Rows
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const rowH = 10;

  for (let i = 0; i < lineItems.length; i++) {
    const item = lineItems[i];

    if (i % 2 === 0) {
      doc.setFillColor(GRAY_BG.r, GRAY_BG.g, GRAY_BG.b);
      doc.rect(MARGIN, y - 1, tableWidth, rowH, "F");
    }

    const rowTextY = y + 6;
    doc.setTextColor(DARK_TEXT.r, DARK_TEXT.g, DARK_TEXT.b);
    doc.text(String(item.description || ""), colDesc, rowTextY);
    doc.setTextColor(GRAY_TEXT.r, GRAY_TEXT.g, GRAY_TEXT.b);
    doc.text(String(item.quantity), colQty, rowTextY, { align: "right" });
    doc.text(formatCurrency(Number(item.unit_price)), colUnit + 14, rowTextY, { align: "right" });

    if (hasDiscount) {
      if (item.discount && item.discount > 0) {
        const discLabel = item.discount_type === "$" ? `-${formatCurrency(item.discount)}` : `-${item.discount}%`;
        doc.text(discLabel, colDisc + 6, rowTextY, { align: "right" });
      } else {
        doc.text("—", colDisc + 6, rowTextY, { align: "right" });
      }
    }

    doc.setTextColor(DARK_TEXT.r, DARK_TEXT.g, DARK_TEXT.b);
    doc.setFont("helvetica", "bold");
    const netTotal = applyDiscount(item);
    doc.text(formatCurrency(netTotal), colTotal, rowTextY, { align: "right" });
    doc.setFont("helvetica", "normal");

    y += rowH;
  }

  // Bottom border
  doc.setDrawColor(GRAY_BORDER.r, GRAY_BORDER.g, GRAY_BORDER.b);
  doc.setLineWidth(0.5);
  doc.line(MARGIN, y + 1, pw - MARGIN, y + 1);

  return y + 6;
}

// ─── Premium Totals ──────────────────────────────────
export function drawPremiumTotals(
  doc: jsPDF,
  startY: number,
  subtotal: number,
  taxRate: number,
  taxAmount: number,
  total: number,
): number {
  const pw = doc.internal.pageSize.getWidth();
  let y = startY;
  const rightCol = pw - MARGIN - 4;
  const labelCol = rightCol - 55;

  // Subtotal
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(GRAY_TEXT.r, GRAY_TEXT.g, GRAY_TEXT.b);
  doc.text("Subtotal:", labelCol, y, { align: "right" });
  doc.setTextColor(DARK_TEXT.r, DARK_TEXT.g, DARK_TEXT.b);
  doc.text(formatCurrency(subtotal), rightCol, y, { align: "right" });

  y += 7;
  doc.setTextColor(GRAY_TEXT.r, GRAY_TEXT.g, GRAY_TEXT.b);
  doc.text(`IVA (${taxRate}%):`, labelCol, y, { align: "right" });
  doc.setTextColor(DARK_TEXT.r, DARK_TEXT.g, DARK_TEXT.b);
  doc.text(formatCurrency(taxAmount), rightCol, y, { align: "right" });

  y += 5;
  // Separator
  doc.setDrawColor(GRAY_BORDER.r, GRAY_BORDER.g, GRAY_BORDER.b);
  doc.setLineWidth(0.3);
  doc.line(labelCol - 10, y, pw - MARGIN, y);

  y += 5;

  // Total highlight box
  const boxW = 80;
  const boxH = 14;
  const boxX = pw - MARGIN - boxW;
  doc.setFillColor(NAVY.r, NAVY.g, NAVY.b);
  doc.roundedRect(boxX, y - 2, boxW, boxH, 2, 2, "F");

  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(GRAY_BG.r, GRAY_BG.g, GRAY_BG.b);
  doc.text("TOTAL:", boxX + 6, y + 7);

  doc.setFontSize(12);
  doc.setTextColor(GOLD.r, GOLD.g, GOLD.b);
  doc.text(`${formatCurrency(total)} MXN`, pw - MARGIN - 4, y + 8, { align: "right" });

  return y + boxH + 4;
}

// ─── Notes Block ─────────────────────────────────────
export function drawPremiumNotes(
  doc: jsPDF,
  notes: string,
  startY: number,
): number {
  const pw = doc.internal.pageSize.getWidth();
  let y = startY + 4;

  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(GRAY_TEXT.r, GRAY_TEXT.g, GRAY_TEXT.b);
  doc.text("NOTAS", MARGIN, y);
  y += 4;

  doc.setFillColor(GRAY_BG.r, GRAY_BG.g, GRAY_BG.b);
  const textLines = doc.splitTextToSize(notes, pw - MARGIN * 2 - 12);
  const boxH = Math.max(14, textLines.length * 4.5 + 8);
  doc.roundedRect(MARGIN, y - 2, pw - MARGIN * 2, boxH, 2, 2, "F");

  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(DARK_TEXT.r, DARK_TEXT.g, DARK_TEXT.b);
  doc.text(textLines, MARGIN + 6, y + 5);

  return y + boxH + 4;
}

// ─── Terms Section ───────────────────────────────────
export function drawTermsSection(
  doc: jsPDF,
  startY: number,
  validUntil: string | null,
  isRental: boolean = false,
): number {
  const pw = doc.internal.pageSize.getWidth();
  let y = startY + 2;

  doc.setDrawColor(GRAY_BORDER.r, GRAY_BORDER.g, GRAY_BORDER.b);
  doc.setLineWidth(0.3);
  doc.line(MARGIN, y, pw - MARGIN, y);
  y += 7;

  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(GRAY_TEXT.r, GRAY_TEXT.g, GRAY_TEXT.b);
  doc.text("TÉRMINOS Y CONDICIONES", MARGIN, y);
  y += 5;

  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  const terms = [
    "• Precios expresados en MXN antes de IVA salvo que se indique lo contrario.",
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
  const y = ph - 14;

  // Line
  doc.setDrawColor(GRAY_BORDER.r, GRAY_BORDER.g, GRAY_BORDER.b);
  doc.setLineWidth(0.3);
  doc.line(MARGIN, y, pw - MARGIN, y);

  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(GRAY_TEXT.r, GRAY_TEXT.g, GRAY_TEXT.b);

  const companyName = company?.razon_social || "LiftGo";
  doc.text(companyName, MARGIN, y + 5);
  doc.text("Documento generado electrónicamente", pw / 2, y + 5, { align: "center" });
  doc.text(`RFC: ${company?.rfc || "—"}`, pw - MARGIN, y + 5, { align: "right" });
}
