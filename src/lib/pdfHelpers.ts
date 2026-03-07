import { jsPDF } from "jspdf";
import { supabase } from "@/integrations/supabase/client";
import { loadImageAsBase64 } from "@/lib/loadImageAsBase64";
import { formatCurrency } from "@/lib/formatCurrency";

// ─── Types ────────────────────────────────────────────

export interface PdfLineItem {
  description: string;
  quantity: number;
  unit_price: number;
  total: number;
}

export interface CompanyData {
  razon_social: string;
  rfc: string;
  regimen_fiscal: string;
  lugar_expedicion: string;
  logo_url: string | null;
}

// fmtMXN removed — use formatCurrency from @/lib/formatCurrency instead

// ─── Fetch company data + logo ────────────────────────

export async function fetchCompanyDataAndLogo(): Promise<{
  company: CompanyData | null;
  logoBase64: string | null;
}> {
  const { data: company } = await supabase
    .from("company_settings")
    .select("*")
    .limit(1)
    .maybeSingle();

  let logoBase64: string | null = null;
  if (company?.logo_url) {
    logoBase64 = await loadImageAsBase64(company.logo_url);
  }

  return { company, logoBase64 };
}

// ─── Draw PDF header with logo ────────────────────────

export function drawPdfHeader(
  doc: jsPDF,
  company: CompanyData | null,
  logoBase64: string | null,
  title: string,
  identifier: string,
  margin: number = 20
): number {
  const pageWidth = doc.internal.pageSize.getWidth();
  let cursorY = 20;

  const textStartX = logoBase64 ? margin + 25 : margin;

  if (logoBase64) {
    doc.addImage(logoBase64, "PNG", margin, cursorY - 5, 20, 20);
  }

  doc.setFontSize(22);
  doc.setTextColor(232, 89, 12);
  doc.text(company?.razon_social || "LiftGo", textStartX, cursorY);
  doc.setFontSize(9);
  doc.setTextColor(102, 102, 102);
  if (company) {
    doc.text(
      `RFC: ${company.rfc} | Régimen: ${company.regimen_fiscal} | C.P.: ${company.lugar_expedicion}`,
      textStartX,
      cursorY + 7
    );
  } else {
    doc.text("Gestión de Flota", textStartX, cursorY + 7);
  }

  doc.setFontSize(24);
  doc.setTextColor(51, 51, 51);
  doc.text(title, pageWidth - margin, cursorY, { align: "right" });
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text(identifier, pageWidth - margin, cursorY + 8, { align: "right" });

  cursorY += 25;
  return cursorY;
}

// ─── Draw line items table ────────────────────────────

export function drawLineItemsTable(
  doc: jsPDF,
  lineItems: PdfLineItem[],
  startY: number,
  margin: number = 20
): number {
  const pageWidth = doc.internal.pageSize.getWidth();
  let cursorY = startY;

  // Table header
  doc.setFillColor(248, 249, 250);
  doc.rect(margin, cursorY - 5, pageWidth - margin * 2, 10, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("Descripción", margin + 2, cursorY);
  doc.text("Cant.", 120, cursorY, { align: "right" });
  doc.text("Precio Unit.", 150, cursorY, { align: "right" });
  doc.text("Total", pageWidth - margin, cursorY, { align: "right" });

  cursorY += 4;
  doc.setDrawColor(222, 226, 230);
  doc.setLineWidth(0.5);
  doc.line(margin, cursorY, pageWidth - margin, cursorY);
  cursorY += 6;

  // Rows
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  for (const item of lineItems) {
    doc.text(String(item.description || ""), margin + 2, cursorY);
    doc.text(String(item.quantity), 120, cursorY, { align: "right" });
    doc.text(formatCurrency(Number(item.unit_price)), 150, cursorY, { align: "right" });
    doc.text(formatCurrency(Number(item.total)), pageWidth - margin, cursorY, { align: "right" });
    cursorY += 3;
    doc.setDrawColor(238, 238, 238);
    doc.setLineWidth(0.2);
    doc.line(margin, cursorY, pageWidth - margin, cursorY);
    cursorY += 5;
  }

  return cursorY;
}

// ─── Draw totals block ────────────────────────────────

export function drawTotalsBlock(
  doc: jsPDF,
  subtotal: number,
  taxRate: number,
  taxAmount: number,
  total: number,
  currency: string = "MXN",
  margin: number = 20
): number {
  const pageWidth = doc.internal.pageSize.getWidth();
  let cursorY = 0; // caller should set Y before calling; we use relative offsets

  // This function expects doc's current Y to be set. We'll use the return value pattern.
  // Actually, let's take startY as a parameter.
  return cursorY; // placeholder, see overload below
}

// Proper version with startY parameter
export function drawTotals(
  doc: jsPDF,
  startY: number,
  subtotal: number,
  taxRate: number,
  taxAmount: number,
  total: number,
  currency: string = "MXN",
  margin: number = 20
): number {
  const pageWidth = doc.internal.pageSize.getWidth();
  let cursorY = startY + 5;

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text("Subtotal:", pageWidth - margin - 50, cursorY, { align: "right" });
  doc.text(formatCurrency(subtotal), pageWidth - margin, cursorY, { align: "right" });

  cursorY += 7;
  doc.text(`IVA (${taxRate}%):`, pageWidth - margin - 50, cursorY, { align: "right" });
  doc.text(formatCurrency(taxAmount), pageWidth - margin, cursorY, { align: "right" });

  cursorY += 4;
  doc.setDrawColor(51, 51, 51);
  doc.setLineWidth(0.5);
  doc.line(pageWidth - margin - 70, cursorY, pageWidth - margin, cursorY);

  cursorY += 7;
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("Total:", pageWidth - margin - 50, cursorY, { align: "right" });
  doc.text(`${formatCurrency(total)} ${currency}`, pageWidth - margin, cursorY, { align: "right" });

  return cursorY;
}

// ─── Draw notes block ─────────────────────────────────

export function drawNotesBlock(
  doc: jsPDF,
  notes: string,
  startY: number,
  margin: number = 20
): number {
  const pageWidth = doc.internal.pageSize.getWidth();
  let cursorY = startY + 15;

  doc.setFontSize(10);
  doc.setTextColor(51, 51, 51);
  doc.setFillColor(248, 249, 250);
  doc.roundedRect(margin, cursorY - 5, pageWidth - margin * 2, 20, 2, 2, "F");
  doc.setFont("helvetica", "bold");
  doc.text("Notas:", margin + 5, cursorY);
  doc.setFont("helvetica", "normal");
  doc.text(String(notes), margin + 5, cursorY + 6, { maxWidth: pageWidth - margin * 2 - 10 });

  return cursorY + 20;
}
