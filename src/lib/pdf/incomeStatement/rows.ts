import type { jsPDF } from "jspdf";
import { formatCurrency } from "@/lib/formatCurrency";
import type { StatementRow, ComparisonRow } from "@/hooks/useIncomeStatementData";

const COST_RED: [number, number, number] = [220, 50, 50];
const NEUTRAL: [number, number, number] = [51, 51, 51];
const POSITIVE_GREEN: [number, number, number] = [34, 139, 34];
const MUTED: [number, number, number] = [150, 150, 150];

const isCostRow = (label: string, isCost: boolean | undefined, value: number) =>
  isCost || (label === "= Utilidad Neta" && value < 0);

const setRowFont = (doc: jsPDF, isSubtotal: boolean | undefined) => {
  doc.setFont("helvetica", isSubtotal ? "bold" : "normal");
};

const drawSubtotalBackground = (doc: jsPDF, y: number) => {
  const margin = 14;
  const pageWidth = doc.internal.pageSize.getWidth();
  doc.setFillColor(245, 245, 245);
  doc.rect(margin, y - 3.5, pageWidth - margin * 2, 6, "F");
};

const formatValue = (val: number, isPercent: boolean | undefined) =>
  isPercent ? `${val.toFixed(1)}%` : formatCurrency(val);

const formatDelta = (delta: number, isPercent: boolean | undefined) => {
  const sign = delta >= 0 ? "+" : "";
  return isPercent ? `${sign}${delta.toFixed(1)} pp` : `${sign}${formatCurrency(delta)}`;
};

interface DrawRowParams {
  doc: jsPDF;
  row: StatementRow | ComparisonRow;
  y: number;
  labelColW: number;
  colW: number;
  isComparison: boolean;
}

export function drawStatementRow({ doc, row, y, labelColW, colW, isComparison }: DrawRowParams): void {
  const margin = 14;
  if (row.isSubtotal) drawSubtotalBackground(doc, y);
  setRowFont(doc, row.isSubtotal);

  doc.setTextColor(...NEUTRAL);
  doc.text(row.label, margin + 2, y);

  if (isComparison) {
    drawComparisonValues(doc, row as ComparisonRow, y, labelColW, colW);
  } else {
    drawStatementValues(doc, row as StatementRow, y, labelColW, colW);
  }
}

function drawStatementValues(doc: jsPDF, sr: StatementRow, y: number, labelColW: number, colW: number) {
  const margin = 14;
  sr.values.forEach((val, i) => {
    doc.setTextColor(...(isCostRow(sr.label, sr.isCost, val) ? COST_RED : NEUTRAL));
    doc.text(formatValue(val, sr.isPercent), margin + labelColW + colW * i + colW - 2, y, { align: "right" });
  });
  const totalIdx = sr.values.length;
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...(isCostRow(sr.label, sr.isCost, sr.total) ? COST_RED : NEUTRAL));
  doc.text(formatValue(sr.total, sr.isPercent), margin + labelColW + colW * totalIdx + colW - 2, y, { align: "right" });
}

function drawComparisonValues(doc: jsPDF, cr: ComparisonRow, y: number, labelColW: number, colW: number) {
  const margin = 14;
  cr.yearValues.forEach((val, i) => {
    doc.setTextColor(...(isCostRow(cr.label, cr.isCost, val) ? COST_RED : NEUTRAL));
    doc.text(formatValue(val, cr.isPercent), margin + labelColW + colW * i + colW - 2, y, { align: "right" });
  });
  const deltaIdx = cr.yearValues.length;
  doc.setTextColor(...(cr.delta >= 0 ? POSITIVE_GREEN : COST_RED));
  doc.text(formatDelta(cr.delta, cr.isPercent), margin + labelColW + colW * deltaIdx + colW - 2, y, { align: "right" });

  if (cr.deltaPct !== null) {
    doc.setTextColor(...(cr.deltaPct >= 0 ? POSITIVE_GREEN : COST_RED));
    const pctTxt = `${cr.deltaPct >= 0 ? "+" : ""}${cr.deltaPct.toFixed(1)}%`;
    doc.text(pctTxt, margin + labelColW + colW * (deltaIdx + 1) + colW - 2, y, { align: "right" });
  } else {
    doc.setTextColor(...MUTED);
    doc.text("—", margin + labelColW + colW * (deltaIdx + 1) + colW - 2, y, { align: "right" });
  }
}
