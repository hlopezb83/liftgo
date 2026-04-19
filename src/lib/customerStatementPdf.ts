import { formatCurrency } from "@/lib/formatCurrency";
import { fetchCompanyDataAndLogo } from "@/lib/pdfShared";
import type { CustomerSummary } from "@/hooks/useCustomerSummary";
import type { Tables } from "@/integrations/supabase/types";
import { differenceInDays, parseISO } from "date-fns";
import { nowMty } from "@/lib/utils";

interface ExportStatementParams {
  customer: Tables<"customers">;
  summary: CustomerSummary;
}

const STATUS_LABELS: Record<string, string> = {
  draft: "Borrador",
  sent: "Enviada",
  paid: "Pagada",
  partial: "Parcial",
  overdue: "Vencida",
  cancelled: "Cancelada",
};

export async function exportCustomerStatementPdf({ customer, summary }: ExportStatementParams): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const autoTableMod = await import("jspdf-autotable");
  const autoTable = autoTableMod.default;
  const { format } = await import("date-fns");
  const { company, logoBase64 } = await fetchCompanyDataAndLogo();

  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 14;
  let y = 16;

  // Header
  const textStartX = logoBase64 ? margin + 22 : margin;
  if (logoBase64) {
    doc.addImage(logoBase64, "PNG", margin, y - 4, 18, 18);
  }
  doc.setFontSize(16);
  doc.setTextColor(232, 89, 12);
  doc.text(company?.razon_social || "LiftGo", textStartX, y);
  doc.setFontSize(8);
  doc.setTextColor(102, 102, 102);
  if (company) {
    doc.text(`RFC: ${company.rfc} | ${company.regimen_fiscal} | C.P.: ${company.lugar_expedicion}`, textStartX, y + 5);
  }

  doc.setFontSize(14);
  doc.setTextColor(51, 51, 51);
  doc.text("Estado de Cuenta", pageWidth - margin, y, { align: "right" });
  doc.setFontSize(9);
  doc.text(`Emitido: ${format(nowMty(), "dd/MM/yyyy")}`, pageWidth - margin, y + 6, { align: "right" });

  y += 24;

  // Customer info
  doc.setFontSize(11);
  doc.setTextColor(0, 0, 0);
  doc.text("Cliente:", margin, y);
  doc.setFontSize(10);
  doc.setTextColor(51, 51, 51);
  doc.text(customer.name, margin + 20, y);
  y += 5;
  if (customer.rfc) {
    doc.setFontSize(9);
    doc.text(`RFC: ${customer.rfc}`, margin + 20, y);
    y += 5;
  }
  if (customer.email) {
    doc.setFontSize(9);
    doc.text(`Email: ${customer.email}`, margin + 20, y);
    y += 5;
  }

  y += 4;

  // Totals
  const totalInvoiced = Number(summary.totals.total_invoiced ?? 0);
  const totalPaid = Number(summary.totals.total_paid ?? 0);
  const balance = totalInvoiced - totalPaid;

  doc.setFillColor(245, 245, 247);
  doc.rect(margin, y, pageWidth - margin * 2, 22, "F");
  doc.setFontSize(9);
  doc.setTextColor(102, 102, 102);
  doc.text("Total Facturado", margin + 5, y + 7);
  doc.text("Total Pagado", margin + 70, y + 7);
  doc.text("Saldo Pendiente", margin + 135, y + 7);

  doc.setFontSize(12);
  doc.setTextColor(51, 51, 51);
  doc.text(formatCurrency(totalInvoiced), margin + 5, y + 16);
  doc.text(formatCurrency(totalPaid), margin + 70, y + 16);
  doc.setTextColor(balance > 0 ? 200 : 51, balance > 0 ? 30 : 153, balance > 0 ? 30 : 51);
  doc.text(formatCurrency(balance), margin + 135, y + 16);

  y += 30;

  // Open invoices table
  const today = nowMty();
  const openInvoices = summary.invoices.filter((inv) => inv.status !== "paid" && inv.status !== "cancelled");

  doc.setFontSize(11);
  doc.setTextColor(0, 0, 0);
  doc.text("Facturas Pendientes", margin, y);
  y += 4;

  if (openInvoices.length === 0) {
    doc.setFontSize(9);
    doc.setTextColor(120, 120, 120);
    doc.text("Sin facturas pendientes.", margin, y + 6);
    y += 12;
  } else {
    autoTable(doc, {
      startY: y,
      head: [["Folio", "Emisión", "Vencimiento", "Días", "Estado", "Total"]],
      body: openInvoices.map((inv) => {
        const days = inv.due_date ? differenceInDays(today, parseISO(inv.due_date)) : 0;
        const dayLabel = inv.due_date ? (days > 0 ? `${days} venc.` : `${Math.abs(days)} restantes`) : "—";
        return [
          inv.invoice_number,
          format(parseISO(inv.issued_at), "dd/MM/yyyy"),
          inv.due_date ? format(parseISO(inv.due_date), "dd/MM/yyyy") : "—",
          dayLabel,
          STATUS_LABELS[inv.status] || inv.status,
          formatCurrency(Number(inv.total)),
        ];
      }),
      theme: "striped",
      headStyles: { fillColor: [232, 89, 12], textColor: 255, fontSize: 9 },
      bodyStyles: { fontSize: 8 },
      columnStyles: { 5: { halign: "right" } },
      margin: { left: margin, right: margin },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
  }

  // All paid invoices
  const paidInvoices = summary.invoices.filter((inv) => inv.status === "paid");
  if (paidInvoices.length > 0 && y < 230) {
    doc.setFontSize(11);
    doc.setTextColor(0, 0, 0);
    doc.text("Facturas Pagadas", margin, y);
    y += 4;
    autoTable(doc, {
      startY: y,
      head: [["Folio", "Emisión", "Total"]],
      body: paidInvoices.map((inv) => [
        inv.invoice_number,
        format(parseISO(inv.issued_at), "dd/MM/yyyy"),
        formatCurrency(Number(inv.total)),
      ]),
      theme: "striped",
      headStyles: { fillColor: [80, 80, 80], textColor: 255, fontSize: 9 },
      bodyStyles: { fontSize: 8 },
      columnStyles: { 2: { halign: "right" } },
      margin: { left: margin, right: margin },
    });
  }

  // Footer
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(150, 150, 150);
    doc.text(
      `Estado de cuenta generado el ${format(nowMty(), "dd/MM/yyyy HH:mm")} — Página ${i} de ${pageCount}`,
      pageWidth / 2,
      doc.internal.pageSize.getHeight() - 8,
      { align: "center" }
    );
  }

  doc.save(`estado-cuenta-${customer.name.replace(/\s+/g, "-")}-${format(nowMty(), "yyyyMMdd")}.pdf`);
}
