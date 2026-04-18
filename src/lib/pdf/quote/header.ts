import { jsPDF } from "jspdf";
import { format } from "date-fns";
import { nowMty } from "@/lib/utils";
import { fmtDate, type CompanyData } from "@/lib/pdfShared";
import {
  GRAY_900, GRAY_700, GRAY_500, GRAY_200,
  FONT_XL, FONT_LG, FONT_MD, FONT_SM, MARGIN,
  getPngDimensions,
} from "./constants";

// ─── Accent Bar ───────────────────────────────────────
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
  const y = 14;

  let title: string;
  if (typeof titleOrSaleFlag === "string") title = titleOrSaleFlag;
  else if (titleOrSaleFlag === true) title = "COTIZACIÓN DE VENTA";
  else title = "COTIZACIÓN";

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

  doc.setFontSize(FONT_LG);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(GRAY_700.r, GRAY_700.g, GRAY_700.b);
  doc.text(title, pw - MARGIN, y, { align: "right" });

  doc.setFontSize(FONT_XL);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(GRAY_900.r, GRAY_900.g, GRAY_900.b);
  doc.text(documentNumber, pw - MARGIN, y + 8, { align: "right" });

  doc.setFontSize(FONT_SM);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(GRAY_500.r, GRAY_500.g, GRAY_500.b);
  doc.text(`Fecha: ${format(nowMty(), "dd/MM/yyyy")}`, pw - MARGIN, y + 14, { align: "right" });

  const sepY = y + 24;
  doc.setDrawColor(GRAY_200.r, GRAY_200.g, GRAY_200.b);
  doc.setLineWidth(0.5);
  doc.line(MARGIN, sepY, pw - MARGIN, sepY);

  return sepY + 6;
}

// ─── Info Section: EMISOR / CLIENTE ───────────────────
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

  const r1 = startY + 4;
  doc.setFontSize(FONT_SM);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(GRAY_500.r, GRAY_500.g, GRAY_500.b);
  doc.text("EMISOR", col1, r1);
  doc.text("CLIENTE", col2, r1);

  const r2 = startY + 10;
  doc.setFontSize(FONT_MD);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(GRAY_900.r, GRAY_900.g, GRAY_900.b);
  doc.text(company?.razon_social || "—", col1, r2);
  doc.text(customerName || "—", col2, r2);

  const r3 = r2 + 5;
  doc.setFontSize(FONT_MD);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(GRAY_700.r, GRAY_700.g, GRAY_700.b);
  doc.text(company ? `RFC: ${company.rfc}` : "", col1, r3);
  doc.text(customerRfc ? `RFC: ${customerRfc}` : "", col2, r3);

  const r4 = r3 + 4;
  doc.text(company ? `C.P. ${company.lugar_expedicion}` : "", col1, r4);
  doc.text(customerCp ? `C.P. ${customerCp}` : "", col2, r4);

  const r5 = r4 + 4;
  doc.text(company ? `Régimen: ${company.regimen_fiscal}` : "", col1, r5);
  if (!isSale && startDate && endDate) {
    doc.text(`Período: ${fmtDate(startDate)} — ${fmtDate(endDate)}`, col2, r5);
  } else if (validUntil) {
    doc.text(`Vigencia hasta: ${fmtDate(validUntil)}`, col2, r5);
  }

  let lastRow = r5;
  if (!isSale && startDate && endDate && validUntil) {
    const r6 = r5 + 4;
    doc.text(`Vigencia hasta: ${fmtDate(validUntil)}`, col2, r6);
    lastRow = r6;
  }

  return lastRow + 8;
}
