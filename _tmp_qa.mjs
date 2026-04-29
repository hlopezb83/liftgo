import { jsPDF } from "./node_modules/jspdf/dist/jspdf.node.js";
import { format } from "date-fns";

// Replicate constants
const GRAY_900 = { r: 17, g: 24, b: 39 };
const GRAY_700 = { r: 55, g: 65, b: 81 };
const GRAY_500 = { r: 107, g: 114, b: 128 };
const GRAY_200 = { r: 229, g: 231, b: 235 };
const GRAY_100 = { r: 243, g: 244, b: 246 };
const GRAY_50 = { r: 249, g: 250, b: 251 };
const FONT_XL = 14, FONT_LG = 10, FONT_MD = 8, FONT_SM = 6.5;
const MARGIN = 20;
const COST_RED = [200, 60, 60];
const POSITIVE_GREEN = [22, 122, 60];

const fmtMXN = (v) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 2 }).format(v);

function drawAccentBar(doc) {
  const pw = doc.internal.pageSize.getWidth();
  doc.setFillColor(GRAY_900.r, GRAY_900.g, GRAY_900.b);
  doc.rect(0, 0, pw, 3, "F");
}

function drawHeader(doc, company, period) {
  const pw = doc.internal.pageSize.getWidth();
  const y = 16;

  // Company info left
  doc.setFontSize(FONT_SM);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(GRAY_500.r, GRAY_500.g, GRAY_500.b);
  doc.text(company.razon_social, MARGIN, y + 14);
  doc.text(`RFC: ${company.rfc}  ·  Régimen: ${company.regimen_fiscal}  ·  C.P. ${company.lugar_expedicion}`, MARGIN, y + 18);

  // Title right
  doc.setFontSize(FONT_LG);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(GRAY_700.r, GRAY_700.g, GRAY_700.b);
  doc.text("ESTADO DE RESULTADOS", pw - MARGIN, y, { align: "right" });

  doc.setFontSize(FONT_XL);
  doc.setTextColor(GRAY_900.r, GRAY_900.g, GRAY_900.b);
  doc.text(period, pw - MARGIN, y + 8, { align: "right" });

  doc.setFontSize(FONT_SM);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(GRAY_500.r, GRAY_500.g, GRAY_500.b);
  doc.text(`Emitido: ${format(new Date(), "dd/MM/yyyy")}`, pw - MARGIN, y + 14, { align: "right" });

  const sepY = y + 24;
  doc.setDrawColor(GRAY_200.r, GRAY_200.g, GRAY_200.b);
  doc.setLineWidth(0.5);
  doc.line(MARGIN, sepY, pw - MARGIN, sepY);
  return sepY + 6;
}

function drawTableHeader(doc, startY, colHeaders, labelColW, colW) {
  const pw = doc.internal.pageSize.getWidth();
  const tw = pw - MARGIN * 2;
  doc.setFillColor(GRAY_100.r, GRAY_100.g, GRAY_100.b);
  doc.rect(MARGIN, startY, tw, 9, "F");
  doc.setFontSize(FONT_SM);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(GRAY_700.r, GRAY_700.g, GRAY_700.b);
  doc.text("CONCEPTO", MARGIN + 3, startY + 6);
  colHeaders.forEach((h, i) => {
    doc.text(h.toUpperCase(), MARGIN + labelColW + colW * i + colW - 3, startY + 6, { align: "right" });
  });
  const lineY = startY + 9;
  doc.setDrawColor(GRAY_200.r, GRAY_200.g, GRAY_200.b);
  doc.setLineWidth(0.3);
  doc.line(MARGIN, lineY, pw - MARGIN, lineY);
  return lineY + 3;
}

function drawRow(doc, row, y, idx, labelColW, colW) {
  const pw = doc.internal.pageSize.getWidth();
  const tw = pw - MARGIN * 2;
  const rowH = 6;
  if (row.isSubtotal) {
    doc.setFillColor(GRAY_100.r, GRAY_100.g, GRAY_100.b);
    doc.rect(MARGIN, y - 3.5, tw, rowH, "F");
  } else if (idx % 2 === 0) {
    doc.setFillColor(GRAY_50.r, GRAY_50.g, GRAY_50.b);
    doc.rect(MARGIN, y - 3.5, tw, rowH, "F");
  }
  doc.setFontSize(FONT_SM);
  doc.setFont("helvetica", row.isSubtotal ? "bold" : "normal");
  const c = row.isSubtotal ? GRAY_900 : GRAY_700;
  doc.setTextColor(c.r, c.g, c.b);
  doc.text(row.label, MARGIN + 3, y);

  row.values.forEach((val, i) => {
    if (row.isCost) doc.setTextColor(...COST_RED);
    else { const cc = row.isSubtotal ? GRAY_900 : GRAY_700; doc.setTextColor(cc.r, cc.g, cc.b); }
    doc.text(fmtMXN(val), MARGIN + labelColW + colW * i + colW - 3, y, { align: "right" });
  });
  doc.setFont("helvetica", "bold");
  if (row.isCost) doc.setTextColor(...COST_RED);
  else doc.setTextColor(GRAY_900.r, GRAY_900.g, GRAY_900.b);
  doc.text(fmtMXN(row.total), MARGIN + labelColW + colW * row.values.length + colW - 3, y, { align: "right" });
}

function drawFooter(doc, company) {
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const y = ph - 12;
  doc.setDrawColor(GRAY_200.r, GRAY_200.g, GRAY_200.b);
  doc.setLineWidth(0.3);
  doc.line(MARGIN, y, pw - MARGIN, y);
  doc.setFontSize(FONT_SM);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(156, 163, 175);
  doc.text(`Estado de Resultados generado electrónicamente — ${company.razon_social}`, pw / 2, y + 5, { align: "center" });
}

// ─── Build sample ──
const company = {
  razon_social: "HERREN ENERGY SA DE CV",
  rfc: "HEN200317227",
  regimen_fiscal: "601",
  lugar_expedicion: "66367",
};

const months = ["Ene 2026", "Feb 2026", "Mar 2026", "Abr 2026"];
const rows = [
  { label: "Ingresos por Renta", values: [120000, 145000, 132000, 158000], total: 555000 },
  { label: "Ingresos por Venta", values: [50000, 0, 78000, 0], total: 128000 },
  { label: "= Ingresos Totales", values: [170000, 145000, 210000, 158000], total: 683000, isSubtotal: true },
  { label: "Mantenimiento", values: [12000, 8500, 15300, 9200], total: 45000, isCost: true },
  { label: "Daños", values: [0, 3200, 0, 1800], total: 5000, isCost: true },
  { label: "Depreciación", values: [22000, 22000, 23500, 23500], total: 91000, isCost: true },
  { label: "= Costo Total", values: [34000, 33700, 38800, 34500], total: 141000, isSubtotal: true, isCost: true },
  { label: "= Margen Bruto", values: [136000, 111300, 171200, 123500], total: 542000, isSubtotal: true },
  { label: "Salarios", values: [45000, 45000, 47000, 47000], total: 184000, isCost: true },
  { label: "Renta de Oficina", values: [18000, 18000, 18000, 18000], total: 72000, isCost: true },
  { label: "Combustibles", values: [8500, 9200, 11400, 10800], total: 39900, isCost: true },
  { label: "Marketing", values: [5000, 7500, 4200, 6800], total: 23500, isCost: true },
  { label: "Otros Gastos", values: [3200, 2800, 4100, 3500], total: 13600, isCost: true },
  { label: "= Total Egresos", values: [79700, 82500, 84700, 86100], total: 333000, isSubtotal: true, isCost: true },
  { label: "= Utilidad Neta", values: [56300, 28800, 86500, 37400], total: 209000, isSubtotal: true },
];

const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
const pw = doc.internal.pageSize.getWidth();
drawAccentBar(doc);
let y = drawHeader(doc, company, "01/01/2026 — 30/04/2026");
const colHeaders = [...months, "Total"];
const labelColW = 60;
const availW = pw - MARGIN * 2 - labelColW;
const colW = Math.min(availW / colHeaders.length, 30);
y = drawTableHeader(doc, y, colHeaders, labelColW, colW);

rows.forEach((row, i) => {
  drawRow(doc, row, y + 4, i, labelColW, colW);
  y += 6;
});
drawFooter(doc, company);

import { writeFileSync } from "fs";
writeFileSync("/tmp/income_qa.pdf", Buffer.from(doc.output("arraybuffer")));
console.log("PDF generated");
