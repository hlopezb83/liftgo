import { checkPage } from "@/lib/pdf/shared";
import type { ContractData, TemplateData } from "./data";

export function generateChecklistPage(doc: any, contract: ContractData, _company: any, _customer: any, forklift: any, tpl: TemplateData) {
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

  // General data
  doc.setFontSize(10); doc.setFont("helvetica", "bold"); doc.setTextColor(51, 51, 51);
  doc.text("I. Datos Generales", margin, cursorY); cursorY += 6;

  doc.setFontSize(9); doc.setFont("helvetica", "normal");
  const generalInfo = [
    ["Fecha y Hora de Entrega:", "______________________"],
    ["Lugar de Entrega:", contract.usage_location || "______________________"],
    ["Marca y Modelo:", `${forklift?.manufacturer || ""} ${forklift?.model || ""}`],
    ["Número de Serie:", forklift?.serial_number || "______________________"],
    ["Horómetro Inicial:", "____________  Final: ____________"],
    ["Tipo de Combustible:", forklift?.fuel_type || "______________________"],
    ["Nivel de Combustible Inicial:", "______________________"],
  ];
  for (const [label, val] of generalInfo) {
    doc.setFont("helvetica", "bold"); doc.text(label, margin, cursorY);
    doc.setFont("helvetica", "normal"); doc.text(val, margin + 50, cursorY);
    cursorY += 5;
  }
  cursorY += 3;

  // Checklist sections from template
  for (const section of tpl.checklist_sections) {
    cursorY = checkPage(doc, cursorY, 15);
    doc.setFont("helvetica", "bold"); doc.setFontSize(10);
    doc.text(section.title, margin, cursorY); cursorY += 5;

    doc.setFontSize(9); doc.setFont("helvetica", "normal");
    for (const item of section.items) {
      cursorY = checkPage(doc, cursorY);
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
      cursorY += 5;
    }
    cursorY += 2;
  }

  // Signatures
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
