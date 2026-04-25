import type { jsPDF } from "jspdf";
import {
  GRAY_900, GRAY_500, GRAY_200, GRAY_100, GRAY_50, MARGIN,
} from "@/lib/pdf/quote/constants";

export function drawSummaryCard(
  doc: jsPDF,
  x: number,
  y: number,
  cardW: number,
  cardH: number,
  label: string,
  value: string,
  valueColor: { r: number; g: number; b: number },
): void {
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
}

export interface BadgeStyle {
  label: string;
  fill: [number, number, number];
  text: [number, number, number];
}

export function pickStatusBadge(balance: number, hasOverdue: boolean): BadgeStyle {
  if (balance <= 0) {
    return { label: "PAGADO", fill: [220, 252, 231], text: [22, 101, 52] };
  }
  if (hasOverdue) {
    return { label: "VENCIDO", fill: [254, 226, 226], text: [153, 27, 27] };
  }
  return { label: "CON SALDO", fill: [254, 243, 199], text: [146, 64, 14] };
}

export function drawStatusBadge(doc: jsPDF, y: number, badge: BadgeStyle): void {
  const pw = doc.internal.pageSize.getWidth();
  const badgeW = 32;
  const badgeH = 6;
  const badgeX = pw - MARGIN - badgeW;
  doc.setFillColor(badge.fill[0], badge.fill[1], badge.fill[2]);
  doc.roundedRect(badgeX, y - 4, badgeW, badgeH, 1.5, 1.5, "F");
  doc.setFontSize(6.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(badge.text[0], badge.text[1], badge.text[2]);
  doc.text(badge.label, badgeX + badgeW / 2, y, { align: "center" });
}

export const STATEMENT_TABLE_STYLES = {
  styles: {
    fontSize: 7.5,
    cellPadding: { top: 2.5, bottom: 2.5, left: 3, right: 3 },
    textColor: [GRAY_900.r, GRAY_900.g, GRAY_900.b] as [number, number, number],
    lineColor: [GRAY_200.r, GRAY_200.g, GRAY_200.b] as [number, number, number],
    lineWidth: 0.15,
  },
  headStyles: {
    fillColor: [GRAY_100.r, GRAY_100.g, GRAY_100.b] as [number, number, number],
    textColor: [55, 65, 81] as [number, number, number],
    fontSize: 6.5,
    fontStyle: "bold" as const,
    cellPadding: { top: 3, bottom: 3, left: 3, right: 3 },
  },
  alternateRowStyles: {
    fillColor: [GRAY_50.r, GRAY_50.g, GRAY_50.b] as [number, number, number],
  },
};
