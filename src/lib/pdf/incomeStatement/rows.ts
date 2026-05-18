import type { jsPDF } from "jspdf";
import { formatCurrency } from "@/lib/formatCurrency";
import type { StatementRow, ComparisonRow } from "@/features/reports/hooks/useIncomeStatementData";
import {
  GRAY_900, GRAY_700, GRAY_500, GRAY_100, GRAY_50,
  FONT_SM, MARGIN,
} from "@/lib/pdf/quote/constants";

const COST_RED: [number, number, number] = [200, 60, 60];
const POSITIVE_GREEN: [number, number, number] = [22, 122, 60];

const isCostRow = (_label: string, isCost: boolean | undefined, value: number) =>
  isCost || value < 0;

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
  rowIndex: number;
  labelColW: number;
  colW: number;
  isComparison: boolean;
}

export function drawStatementRow({
  doc, row, y, rowIndex, labelColW, colW, isComparison,
}: DrawRowParams): void {
  const pw = doc.internal.pageSize.getWidth();
  const tableWidth = pw - MARGIN * 2;
  const rowH = 6;

  // Background: subtotal rows = stronger gray; otherwise zebra
  if (row.isSubtotal) {
    doc.setFillColor(GRAY_100.r, GRAY_100.g, GRAY_100.b);
    doc.rect(MARGIN, y - 3.5, tableWidth, rowH, "F");
  } else if (rowIndex % 2 === 0) {
    doc.setFillColor(GRAY_50.r, GRAY_50.g, GRAY_50.b);
    doc.rect(MARGIN, y - 3.5, tableWidth, rowH, "F");
  }

  doc.setFontSize(FONT_SM);
  doc.setFont("helvetica", row.isSubtotal ? "bold" : "normal");
  doc.setTextColor(
    row.isSubtotal ? GRAY_900.r : GRAY_700.r,
    row.isSubtotal ? GRAY_900.g : GRAY_700.g,
    row.isSubtotal ? GRAY_900.b : GRAY_700.b,
  );
  doc.text(row.label, MARGIN + 3, y);

  if (isComparison) {
    drawComparisonValues(doc, row as ComparisonRow, y, labelColW, colW);
  } else {
    drawStatementValues(doc, row as StatementRow, y, labelColW, colW);
  }
}

function drawStatementValues(
  doc: jsPDF, sr: StatementRow, y: number, labelColW: number, colW: number,
) {
  sr.values.forEach((val, i) => {
    if (isCostRow(sr.label, sr.isCost, val)) {
      doc.setTextColor(...COST_RED);
    } else {
      doc.setTextColor(
        sr.isSubtotal ? GRAY_900.r : GRAY_700.r,
        sr.isSubtotal ? GRAY_900.g : GRAY_700.g,
        sr.isSubtotal ? GRAY_900.b : GRAY_700.b,
      );
    }
    doc.text(
      formatValue(val, sr.isPercent),
      MARGIN + labelColW + colW * i + colW - 3,
      y,
      { align: "right" },
    );
  });
  const totalIdx = sr.values.length;
  doc.setFont("helvetica", "bold");
  if (isCostRow(sr.label, sr.isCost, sr.total)) {
    doc.setTextColor(...COST_RED);
  } else {
    doc.setTextColor(GRAY_900.r, GRAY_900.g, GRAY_900.b);
  }
  doc.text(
    formatValue(sr.total, sr.isPercent),
    MARGIN + labelColW + colW * totalIdx + colW - 3,
    y,
    { align: "right" },
  );
}

function drawComparisonValues(
  doc: jsPDF, cr: ComparisonRow, y: number, labelColW: number, colW: number,
) {
  cr.yearValues.forEach((val, i) => {
    if (isCostRow(cr.label, cr.isCost, val)) {
      doc.setTextColor(...COST_RED);
    } else {
      doc.setTextColor(
        cr.isSubtotal ? GRAY_900.r : GRAY_700.r,
        cr.isSubtotal ? GRAY_900.g : GRAY_700.g,
        cr.isSubtotal ? GRAY_900.b : GRAY_700.b,
      );
    }
    doc.text(
      formatValue(val, cr.isPercent),
      MARGIN + labelColW + colW * i + colW - 3,
      y,
      { align: "right" },
    );
  });
  const deltaIdx = cr.yearValues.length;
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...(cr.delta >= 0 ? POSITIVE_GREEN : COST_RED));
  doc.text(
    formatDelta(cr.delta, cr.isPercent),
    MARGIN + labelColW + colW * deltaIdx + colW - 3,
    y,
    { align: "right" },
  );

  if (cr.deltaPct !== null) {
    doc.setTextColor(...(cr.deltaPct >= 0 ? POSITIVE_GREEN : COST_RED));
    const pctTxt = `${cr.deltaPct >= 0 ? "+" : ""}${cr.deltaPct.toFixed(1)}%`;
    doc.text(
      pctTxt,
      MARGIN + labelColW + colW * (deltaIdx + 1) + colW - 3,
      y,
      { align: "right" },
    );
  } else {
    doc.setTextColor(GRAY_500.r, GRAY_500.g, GRAY_500.b);
    doc.text(
      "—",
      MARGIN + labelColW + colW * (deltaIdx + 1) + colW - 3,
      y,
      { align: "right" },
    );
  }
}
