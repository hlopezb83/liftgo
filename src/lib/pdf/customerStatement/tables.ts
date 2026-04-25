import type { jsPDF } from "jspdf";
import { differenceInDays, parseISO, format } from "date-fns";
import { formatCurrency } from "@/lib/formatCurrency";
import { nowMty } from "@/lib/utils";
import { GRAY_700, GRAY_500, MARGIN } from "@/lib/pdf/quote/constants";
import { drawAccentBar } from "@/lib/pdf/quote/header";
import { STATEMENT_TABLE_STYLES } from "./parts";
import type { CustomerSummary } from "@/hooks/useCustomerSummary";

const STATUS_LABELS: Record<string, string> = {
  draft: "Borrador",
  sent: "Enviada",
  paid: "Pagada",
  partial: "Parcial",
  overdue: "Vencida",
  cancelled: "Cancelada",
};

type Invoice = CustomerSummary["invoices"][number];
type AutoTableFn = (doc: jsPDF, options: Record<string, unknown>) => void;

export function drawOpenInvoicesTable(
  doc: jsPDF,
  startY: number,
  openInvoices: Invoice[],
  autoTable: AutoTableFn,
): number {
  let y = startY;
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(GRAY_700.r, GRAY_700.g, GRAY_700.b);
  doc.text("FACTURAS PENDIENTES", MARGIN, y);
  y += 3;

  if (openInvoices.length === 0) {
    y += 4;
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(GRAY_500.r, GRAY_500.g, GRAY_500.b);
    doc.text("Sin facturas pendientes.", MARGIN, y);
    return y + 8;
  }

  const today = nowMty();
  autoTable(doc, {
    startY: y,
    head: [["Folio", "Emisión", "Vencimiento", "Días", "Estado", "Total"]],
    body: openInvoices.map((inv) => {
      const days = inv.due_date ? differenceInDays(today, parseISO(inv.due_date)) : 0;
      const dayLabel = inv.due_date
        ? days > 0 ? `${days} venc.` : `${Math.abs(days)} rest.`
        : "—";
      return [
        inv.invoice_number,
        format(parseISO(inv.issued_at), "dd/MM/yyyy"),
        inv.due_date ? format(parseISO(inv.due_date), "dd/MM/yyyy") : "—",
        dayLabel,
        STATUS_LABELS[inv.status] || inv.status,
        formatCurrency(Number(inv.total)),
      ];
    }),
    theme: "plain",
    ...STATEMENT_TABLE_STYLES,
    columnStyles: {
      3: { halign: "center" },
      5: { halign: "right", fontStyle: "bold" },
    },
    margin: { left: MARGIN, right: MARGIN, bottom: 20 },
    didDrawPage: () => { drawAccentBar(doc); },
  });
  return (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
}

export function drawPaidInvoicesTable(
  doc: jsPDF,
  startY: number,
  paidInvoices: Invoice[],
  autoTable: AutoTableFn,
): void {
  if (paidInvoices.length === 0) return;

  const ph = doc.internal.pageSize.getHeight();
  let y = startY;
  if (y > ph - 50) {
    doc.addPage();
    drawAccentBar(doc);
    y = 16;
  }

  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(GRAY_700.r, GRAY_700.g, GRAY_700.b);
  doc.text("FACTURAS PAGADAS", MARGIN, y);
  y += 3;

  autoTable(doc, {
    startY: y,
    head: [["Folio", "Emisión", "Total"]],
    body: paidInvoices.map((inv) => [
      inv.invoice_number,
      format(parseISO(inv.issued_at), "dd/MM/yyyy"),
      formatCurrency(Number(inv.total)),
    ]),
    theme: "plain",
    ...STATEMENT_TABLE_STYLES,
    columnStyles: {
      2: { halign: "right", fontStyle: "bold" },
    },
    margin: { left: MARGIN, right: MARGIN, bottom: 20 },
    didDrawPage: () => { drawAccentBar(doc); },
  });
}
