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
