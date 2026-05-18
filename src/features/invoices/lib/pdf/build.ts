import { supabase } from "@/integrations/supabase/client";
import { fetchCompanyDataAndLogo, fmtDate, type PdfLineItem } from "@/lib/pdf/shared";
import { parseLineItems } from "@/lib/lineItems";
import type jsPDF from "jspdf";

const GREEN = { r: 22, g: 163, b: 74 };
type RGB = { r: number; g: number; b: number };
type Invoice = Awaited<ReturnType<typeof fetchInvoice>>;

function getInvoicePdfStatusLabel(status: string): string {
  if (status === "paid") return "PAGADA";
  if (status === "cancelled") return "CANCELADA";
  return "PENDIENTE";
}

function getInvoicePdfStatusColor(status: string, paidColor: RGB): RGB {
  if (status === "paid") return paidColor;
  if (status === "cancelled") return { r: 220, g: 38, b: 38 };
  return { r: 234, g: 179, b: 8 };
}

async function fetchInvoice(invoiceId: string) {
  const { data: invoice, error } = await supabase
    .from("invoices").select("*").eq("id", invoiceId).single();
  if (error || !invoice) throw new Error("Factura no encontrada");
  return invoice;
}

async function resolveCustomerFiscal(invoice: { customer_id: string | null; receptor_rfc: string | null }) {
  let customerRfc: string | null = null;
  let customerCp: string | null = null;
  if (invoice.customer_id) {
    const { data: cust } = await supabase
      .from("customers").select("rfc, domicilio_fiscal_cp").eq("id", invoice.customer_id).single();
    if (cust) {
      customerRfc = cust.rfc;
      customerCp = cust.domicilio_fiscal_cp;
    }
  }
  if (!customerRfc && invoice.receptor_rfc) customerRfc = invoice.receptor_rfc;
  return { customerRfc, customerCp };
}

interface PdfHelpers {
  GRAY_500: RGB; GRAY_200: RGB; GRAY_900: RGB; MARGIN: number;
}

function drawSatBadge(doc: jsPDF, invoice: Invoice, y: number, pw: number, h: PdfHelpers): number {
  if (!(invoice.cfdi_status === "stamped" && invoice.cfdi_uuid)) return y;
  doc.setFillColor(GREEN.r, GREEN.g, GREEN.b);
  doc.roundedRect(pw - h.MARGIN - 70, y - 6, 70, 8, 2, 2, "F");
  doc.setFontSize(6);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(255, 255, 255);
  doc.text("TIMBRADO SAT", pw - h.MARGIN - 35, y - 1, { align: "center" });
  let nextY = y + 4;
  doc.setFontSize(6);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(h.GRAY_500.r, h.GRAY_500.g, h.GRAY_500.b);
  doc.text(`UUID: ${invoice.cfdi_uuid}`, pw - h.MARGIN, nextY, { align: "right" });
  nextY += 6;
  return nextY;
}

function drawDetailsAndStatus(doc: jsPDF, invoice: Invoice, detailY: number, pw: number, h: PdfHelpers) {
  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(h.GRAY_500.r, h.GRAY_500.g, h.GRAY_500.b);
  doc.text("Emitida:", h.MARGIN, detailY);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(h.GRAY_900.r, h.GRAY_900.g, h.GRAY_900.b);
  doc.text(fmtDate(invoice.issued_at), h.MARGIN + 16, detailY);

  doc.setFont("helvetica", "bold");
  doc.setTextColor(h.GRAY_500.r, h.GRAY_500.g, h.GRAY_500.b);
  doc.text("Vence:", h.MARGIN + 42, detailY);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(h.GRAY_900.r, h.GRAY_900.g, h.GRAY_900.b);
  doc.text(fmtDate(invoice.due_date), h.MARGIN + 54, detailY);

  const statusLabel = getInvoicePdfStatusLabel(invoice.status);
  const statusColor = getInvoicePdfStatusColor(invoice.status, GREEN);
  doc.setFillColor(statusColor.r, statusColor.g, statusColor.b);
  doc.roundedRect(h.MARGIN + 80, detailY - 3.5, 22, 5, 1, 1, "F");
  doc.setFontSize(5.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(255, 255, 255);
  doc.text(statusLabel, h.MARGIN + 91, detailY, { align: "center" });

  if (invoice.forma_pago || invoice.metodo_pago) {
    const paymentInfo = [invoice.forma_pago, invoice.metodo_pago].filter(Boolean).join(" • ");
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(h.GRAY_500.r, h.GRAY_500.g, h.GRAY_500.b);
    doc.text(paymentInfo, pw - h.MARGIN, detailY, { align: "right" });
  }
}

function drawCfdiQrBox(doc: jsPDF, invoice: Invoice, y: number, h: PdfHelpers, drawAccentBar: (d: jsPDF) => void): void {
  if (!invoice.cfdi_uuid) return;
  const ph = doc.internal.pageSize.getHeight();
  let yy = y;
  if (yy + 34 > ph - 20) {
    doc.addPage();
    drawAccentBar(doc);
    yy = 16;
  }
  doc.setDrawColor(h.GRAY_200.r, h.GRAY_200.g, h.GRAY_200.b);
  doc.setLineWidth(0.5);
  doc.roundedRect(h.MARGIN, yy, 28, 28, 2, 2, "S");
  doc.setFontSize(6);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(h.GRAY_500.r, h.GRAY_500.g, h.GRAY_500.b);
  doc.text("QR CFDI", h.MARGIN + 14, yy + 16, { align: "center" });
  doc.text("Este documento es una representación impresa de un CFDI", h.MARGIN + 34, yy + 10);
  doc.text("Verificar en: https://verificacfdi.facturaelectronica.sat.gob.mx", h.MARGIN + 34, yy + 16);
}

export async function buildInvoicePdf(invoiceId: string): Promise<void> {
  const invoice = await fetchInvoice(invoiceId);
  const { company, logoBase64 } = await fetchCompanyDataAndLogo();
  const { customerRfc, customerCp } = await resolveCustomerFiscal(invoice);

  const { jsPDF: JsPDF } = await import("jspdf");
  const {
    drawAccentBar, drawPremiumHeader, drawInfoCardsAt,
    drawPremiumTable, drawBottomSection, drawFooter,
    GRAY_500, GRAY_200, GRAY_900, MARGIN,
  } = await import("@/lib/pdf/quoteGenerator");
  const h: PdfHelpers = { GRAY_500, GRAY_200, GRAY_900, MARGIN };

  const doc = new JsPDF();
  const pw = doc.internal.pageSize.getWidth();

  drawAccentBar(doc);

  const invoiceLabel = invoice.serie && invoice.folio
    ? `${invoice.serie}-${invoice.folio}`
    : invoice.invoice_number;

  let y = drawPremiumHeader(doc, company, logoBase64, invoiceLabel, "FACTURA");
  y = drawSatBadge(doc, invoice, y, pw, h);

  y = drawInfoCardsAt(
    doc, y,
    invoice.customer_name,
    null, null, null,
    true,
    customerRfc, customerCp, company,
  );

  drawDetailsAndStatus(doc, invoice, y, pw, h);
  y += 8;

  const lineItems = parseLineItems<PdfLineItem>(invoice.line_items);
  const invoiceCurrency = invoice.moneda || "MXN";
  y = drawPremiumTable(doc, lineItems, y, invoiceCurrency);

  y = drawBottomSection(
    doc, y,
    Number(invoice.subtotal), Number(invoice.tax_rate),
    Number(invoice.tax_amount), Number(invoice.total),
    invoiceCurrency,
    invoice.notes ? String(invoice.notes) : null,
    null,
    false,
  );

  drawCfdiQrBox(doc, invoice, y, h, drawAccentBar);
  drawFooter(doc, company);

  doc.save(`${invoice.invoice_number}.pdf`);
}
