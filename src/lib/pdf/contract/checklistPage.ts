import type jsPDF from "jspdf";
import { checkPage } from "@/lib/pdf/shared";
import type { ContractData, TemplateData } from "./data";

interface CompanyRef { razon_social?: string | null }
interface CustomerRef { name?: string | null }
interface ForkliftRef {
  manufacturer?: string | null;
  model?: string | null;
  serial_number?: string | null;
  fuel_type?: string | null;
}

function drawChecklistItem(doc: jsPDF, item: string, cursorY: number, margin: number, pageWidth: number): void {
  doc.rect(margin + 2, cursorY - 3, 3, 3);
  doc.text(item, margin + 8, cursorY);
  doc.setFontSize(7);
  doc.text("B", pageWidth - margin - 30, cursorY);
  doc.rect(pageWidth - margin - 27, cursorY - 3, 3, 3);
  doc.text("M", pageWidth - margin - 20, cursorY);
  doc.rect(pageWidth - margin - 17, cursorY - 3, 3, 3);
  doc.text("N/A", pageWidth - margin - 10, cursorY);
  doc.rect(pageWidth - margin - 4, cursorY - 3, 3, 3);
  doc.setFontSize(9);
}

function drawGeneralInfoBlock(
  doc: jsPDF, margin: number, startY: number,
  contract: ContractData, forklift: ForkliftRef | null,
): void {
  const generalInfo: Array<[string, string]> = [
    ["Fecha y Hora de Entrega:", "______________________"],
    ["Lugar de Entrega:", contract.usage_location || "______________________"],
    ["Marca y Modelo:", `${forklift?.manufacturer || ""} ${forklift?.model || ""}`],
    ["Número de Serie:", forklift?.serial_number || "______________________"],
    ["Horómetro Inicial:", "____________  Final: ____________"],
    ["Tipo de Combustible:", forklift?.fuel_type || "______________________"],
    ["Nivel de Combustible Inicial:", "______________________"],
  ];
  let y = startY;
  for (const [label, val] of generalInfo) {
    doc.setFont("helvetica", "bold"); doc.text(label, margin, y);
    doc.setFont("helvetica", "normal"); doc.text(val, margin + 50, y);
    y += 5;
  }
}

function drawChecklistSection(
  doc: jsPDF, section: { title: string; items: string[] },
  startY: number, margin: number, pageWidth: number,
): number {
  let cursorY = checkPage(doc, startY, 15);
  doc.setFont("helvetica", "bold"); doc.setFontSize(10);
  doc.text(section.title, margin, cursorY); cursorY += 5;
  doc.setFontSize(9); doc.setFont("helvetica", "normal");
  for (const item of section.items) {
    cursorY = checkPage(doc, cursorY);
    drawChecklistItem(doc, item, cursorY, margin, pageWidth);
    cursorY += 5;
  }
  return cursorY + 2;
}

export function generateChecklistPage(
  doc: jsPDF,
  contract: ContractData,
  _company: CompanyRef | null,
  _customer: CustomerRef | null,
  forklift: ForkliftRef | null,
  tpl: TemplateData,
) {
  void _company; void _customer;
  doc.addPage();
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 20;
  let cursorY = 20;

  doc.setFontSize(13); doc.setFont("helvetica", "bold"); doc.setTextColor(51, 51, 51);
  doc.text("ANEXO A: CHECKLIST DE INSPECCIÓN Y ENTREGA", pageWidth / 2, cursorY, { align: "center" });
  cursorY += 8;

  doc.setFontSize(8); doc.setFont("helvetica", "normal"); doc.setTextColor(102, 102, 102);
  doc.text(`Parte integral del ${contract.contract_number}`, pageWidth / 2, cursorY, { align: "center" });
  cursorY += 10;

  doc.setFontSize(10); doc.setFont("helvetica", "bold"); doc.setTextColor(51, 51, 51);
  doc.text("I. Datos Generales", margin, cursorY); cursorY += 6;

  doc.setFontSize(9); doc.setFont("helvetica", "normal");
  drawGeneralInfoBlock(doc, margin, cursorY, contract, forklift);
  cursorY += 7 * 5 + 3;

  for (const section of tpl.checklist_sections) {
    cursorY = drawChecklistSection(doc, section, cursorY, margin, pageWidth);
  }

  cursorY = checkPage(doc, cursorY, 35);
  cursorY += 8;
  const col1 = margin;
  const col2 = pageWidth / 2 + 5;
  const lineWidth = (pageWidth - margin * 2 - 10) / 2;
  doc.setDrawColor(51, 51, 51);
  doc.line(col1, cursorY, col1 + lineWidth, cursorY);
  doc.line(col2, cursorY, col2 + lineWidth, cursorY);
  cursorY += 4;
  doc.setFontSize(8);
  doc.text("Entregado por (Técnico)", col1, cursorY);
  doc.text("Recibido por (Cliente)", col2, cursorY);
}
