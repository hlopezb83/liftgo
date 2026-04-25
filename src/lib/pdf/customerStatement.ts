import { formatCurrency } from "@/lib/formatCurrency";
import { fetchCompanyDataAndLogo } from "@/lib/pdfShared";
import type { CustomerSummary } from "@/hooks/useCustomerSummary";
import type { Tables } from "@/integrations/supabase/types";
import { differenceInDays, parseISO } from "date-fns";
import { nowMty } from "@/lib/utils";
import {
  GRAY_900, GRAY_700, GRAY_500, GRAY_200, GRAY_100, GRAY_50,
  MARGIN,
} from "@/lib/pdf/quote/constants";
import { drawAccentBar, drawPremiumHeader, drawInfoCardsAt } from "@/lib/pdf/quote/header";
import { drawFooter } from "@/lib/pdf/quote/totals";

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
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();

  // 1. Accent bar
  drawAccentBar(doc);

  // 2. Premium header — folio EC-yyyyMMdd
  const folio = `EC-${format(nowMty(), "yyyyMMdd")}`;
  let y = drawPremiumHeader(doc, company, logoBase64, folio, "ESTADO DE CUENTA");

  // 3. Issuer / Customer cards (isSale=true to skip rental period block)
  y = drawInfoCardsAt(
    doc,
    y,
    customer.name,
    null,
    null,
    null,
    true,
    customer.rfc ?? null,
    customer.domicilio_fiscal_cp ?? null,
    company,
  );

  // 4. Totals
  const totalInvoiced = Number(summary.totals.total_invoiced ?? 0);
  const totalPaid = Number(summary.totals.total_paid ?? 0);
  const balance = totalInvoiced - totalPaid;
  const today = nowMty();

  const openInvoices = summary.invoices.filter((inv) => inv.status !== "paid" && inv.status !== "cancelled");
  const hasOverdue = openInvoices.some(
    (inv) => inv.due_date && differenceInDays(today, parseISO(inv.due_date)) > 0,
  );

  // 4a. Status badge row (right aligned)
  let badgeLabel = "PAGADO";
  let badgeFill: [number, number, number] = [220, 252, 231]; // green-100
  let badgeText: [number, number, number] = [22, 101, 52]; // green-800
  if (balance > 0) {
    if (hasOverdue) {
      badgeLabel = "VENCIDO";
      badgeFill = [254, 226, 226]; // red-100
      badgeText = [153, 27, 27]; // red-800
    } else {
      badgeLabel = "CON SALDO";
      badgeFill = [254, 243, 199]; // amber-100
      badgeText = [146, 64, 14]; // amber-800
    }
  }

  const badgeW = 32;
  const badgeH = 6;
  const badgeX = pw - MARGIN - badgeW;
  doc.setFillColor(badgeFill[0], badgeFill[1], badgeFill[2]);
  doc.roundedRect(badgeX, y - 4, badgeW, badgeH, 1.5, 1.5, "F");
  doc.setFontSize(6.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(badgeText[0], badgeText[1], badgeText[2]);
  doc.text(badgeLabel, badgeX + badgeW / 2, y, { align: "center" });

  y += 6;

  // 5. Three summary cards
  const cardGap = 4;
  const cardW = (pw - MARGIN * 2 - cardGap * 2) / 3;
  const cardH = 22;

  const drawSummaryCard = (
    x: number,
    label: string,
    value: string,
    valueColor: { r: number; g: number; b: number },
  ) => {
    doc.setFillColor(GRAY_50.r, GRAY_50.g, GRAY_50.b);
    doc.setDrawColor(GRAY_200.r, GRAY_200.g, GRAY_200.b);
    doc.setLineWidth(0.3);
    doc.roundedRect(x, y, cardW, cardH, 2, 2, "FD");

    doc.setFontSize(6.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(GRAY_500.r, GRAY_500.g, GRAY_500.b);
    doc.text(label, x + 4, y + 6);

    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(valueColor.r, valueColor.g, valueColor.b);
    doc.text(value, x + 4, y + 16);
  };

  drawSummaryCard(MARGIN, "TOTAL FACTURADO", formatCurrency(totalInvoiced), GRAY_900);
  drawSummaryCard(MARGIN + cardW + cardGap, "TOTAL PAGADO", formatCurrency(totalPaid), GRAY_900);
  drawSummaryCard(
    MARGIN + (cardW + cardGap) * 2,
    "SALDO PENDIENTE",
    formatCurrency(balance),
    balance > 0 ? { r: 153, g: 27, b: 27 } : GRAY_900,
  );

  y += cardH + 8;

  // 6. Open invoices table (premium gray palette)
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
    y += 8;
  } else {
    autoTable(doc, {
      startY: y,
      head: [["Folio", "Emisión", "Vencimiento", "Días", "Estado", "Total"]],
      body: openInvoices.map((inv) => {
        const days = inv.due_date ? differenceInDays(today, parseISO(inv.due_date)) : 0;
        const dayLabel = inv.due_date
          ? days > 0
            ? `${days} venc.`
            : `${Math.abs(days)} rest.`
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
      styles: {
        fontSize: 7.5,
        cellPadding: { top: 2.5, bottom: 2.5, left: 3, right: 3 },
        textColor: [GRAY_900.r, GRAY_900.g, GRAY_900.b],
        lineColor: [GRAY_200.r, GRAY_200.g, GRAY_200.b],
        lineWidth: 0.15,
      },
      headStyles: {
        fillColor: [GRAY_100.r, GRAY_100.g, GRAY_100.b],
        textColor: [GRAY_700.r, GRAY_700.g, GRAY_700.b],
        fontSize: 6.5,
        fontStyle: "bold",
        cellPadding: { top: 3, bottom: 3, left: 3, right: 3 },
      },
      alternateRowStyles: {
        fillColor: [GRAY_50.r, GRAY_50.g, GRAY_50.b],
      },
      columnStyles: {
        3: { halign: "center" },
        5: { halign: "right", fontStyle: "bold" },
      },
      margin: { left: MARGIN, right: MARGIN, bottom: 20 },
      didDrawPage: () => {
        drawAccentBar(doc);
      },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
  }

  // 7. Paid invoices table
  const paidInvoices = summary.invoices.filter((inv) => inv.status === "paid");
  if (paidInvoices.length > 0) {
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
      styles: {
        fontSize: 7.5,
        cellPadding: { top: 2.5, bottom: 2.5, left: 3, right: 3 },
        textColor: [GRAY_700.r, GRAY_700.g, GRAY_700.b],
        lineColor: [GRAY_200.r, GRAY_200.g, GRAY_200.b],
        lineWidth: 0.15,
      },
      headStyles: {
        fillColor: [GRAY_100.r, GRAY_100.g, GRAY_100.b],
        textColor: [GRAY_700.r, GRAY_700.g, GRAY_700.b],
        fontSize: 6.5,
        fontStyle: "bold",
        cellPadding: { top: 3, bottom: 3, left: 3, right: 3 },
      },
      alternateRowStyles: {
        fillColor: [GRAY_50.r, GRAY_50.g, GRAY_50.b],
      },
      columnStyles: {
        2: { halign: "right", fontStyle: "bold" },
      },
      margin: { left: MARGIN, right: MARGIN, bottom: 20 },
      didDrawPage: () => {
        drawAccentBar(doc);
      },
    });
  }

  // 8. Footer on every page
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    drawFooter(doc, company);
    // Page number above footer line
    doc.setFontSize(6.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(GRAY_500.r, GRAY_500.g, GRAY_500.b);
    doc.text(
      `Emitido ${format(nowMty(), "dd/MM/yyyy HH:mm")} · Página ${i} de ${pageCount}`,
      pw - MARGIN,
      ph - 14,
      { align: "right" },
    );
  }

  doc.save(`estado-cuenta-${customer.name.replace(/\s+/g, "-")}-${format(nowMty(), "yyyyMMdd")}.pdf`);
}
