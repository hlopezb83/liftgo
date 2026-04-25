import { formatCurrency } from "@/lib/formatCurrency";
import { fetchCompanyDataAndLogo } from "@/lib/pdf/shared";
import type { CustomerSummary } from "@/hooks/useCustomerSummary";
import type { Tables } from "@/integrations/supabase/types";
import { differenceInDays, parseISO } from "date-fns";
import { nowMty } from "@/lib/utils";
import {
  GRAY_900, GRAY_500, MARGIN,
} from "@/lib/pdf/quote/constants";
import { drawAccentBar, drawPremiumHeader, drawInfoCardsAt } from "@/lib/pdf/quote/header";
import { drawFooter } from "@/lib/pdf/quote/totals";
import { drawSummaryCard, pickStatusBadge, drawStatusBadge } from "./customerStatement/parts";
import { drawOpenInvoicesTable, drawPaidInvoicesTable } from "./customerStatement/tables";

interface ExportStatementParams {
  customer: Tables<"customers">;
  summary: CustomerSummary;
}

export async function exportCustomerStatementPdf({ customer, summary }: ExportStatementParams): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const autoTableMod = await import("jspdf-autotable");
  const autoTable = autoTableMod.default;
  const { format } = await import("date-fns");
  const { company, logoBase64 } = await fetchCompanyDataAndLogo();

  const doc = new jsPDF();
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();

  drawAccentBar(doc);

  const folio = `EC-${format(nowMty(), "yyyyMMdd")}`;
  let y = drawPremiumHeader(doc, company, logoBase64, folio, "ESTADO DE CUENTA");

  y = drawInfoCardsAt(
    doc, y, customer.name, null, null, null, true,
    customer.rfc ?? null, customer.domicilio_fiscal_cp ?? null, company,
  );

  const totalInvoiced = Number(summary.totals.total_invoiced ?? 0);
  const totalPaid = Number(summary.totals.total_paid ?? 0);
  const balance = totalInvoiced - totalPaid;
  const today = nowMty();

  const openInvoices = summary.invoices.filter((inv) => inv.status !== "paid" && inv.status !== "cancelled");
  const hasOverdue = openInvoices.some(
    (inv) => inv.due_date && differenceInDays(today, parseISO(inv.due_date)) > 0,
  );

  drawStatusBadge(doc, y, pickStatusBadge(balance, hasOverdue));
  y += 6;

  const cardGap = 4;
  const cardW = (pw - MARGIN * 2 - cardGap * 2) / 3;
  const cardH = 22;

  drawSummaryCard(doc, MARGIN, y, cardW, cardH, "TOTAL FACTURADO", formatCurrency(totalInvoiced), GRAY_900);
  drawSummaryCard(doc, MARGIN + cardW + cardGap, y, cardW, cardH, "TOTAL PAGADO", formatCurrency(totalPaid), GRAY_900);
  drawSummaryCard(
    doc, MARGIN + (cardW + cardGap) * 2, y, cardW, cardH,
    "SALDO PENDIENTE", formatCurrency(balance),
    balance > 0 ? { r: 153, g: 27, b: 27 } : GRAY_900,
  );

  y += cardH + 8;

  y = drawOpenInvoicesTable(doc, y, openInvoices, autoTable);
  drawPaidInvoicesTable(doc, y, summary.invoices.filter((inv) => inv.status === "paid"), autoTable);

  // Footer + page numbers
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    drawFooter(doc, company);
    doc.setFontSize(6.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(GRAY_500.r, GRAY_500.g, GRAY_500.b);
    doc.text(
      `Emitido ${format(nowMty(), "dd/MM/yyyy HH:mm")} · Página ${i} de ${pageCount}`,
      pw - MARGIN, ph - 14, { align: "right" },
    );
  }

  doc.save(`estado-cuenta-${customer.name.replace(/\s+/g, "-")}-${format(nowMty(), "yyyyMMdd")}.pdf`);
}
