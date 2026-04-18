import { format } from "date-fns";
import { nowMty } from "@/lib/utils";
import { replacePlaceholders } from "@/lib/templateUtils";
import { addWrappedText, checkPage } from "@/lib/pdfShared";
import { DEFAULT_PAGARE } from "@/lib/contractPdfData";
import type { ContractData, TemplateData } from "./data";

export function generatePagarePage(doc: any, contract: ContractData, _company: any, customer: any, tpl: TemplateData, vars: Record<string, string>) {
  doc.addPage();
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 20;
  let cursorY = 25;

  doc.setFontSize(16); doc.setFont("helvetica", "bold"); doc.setTextColor(51, 51, 51);
  doc.text("PAGARÉ", pageWidth / 2, cursorY, { align: "center" });
  cursorY += 8;

  doc.setFontSize(8); doc.setFont("helvetica", "normal"); doc.setTextColor(102, 102, 102);
  doc.text(`Anexo B del ${contract.contract_number}`, pageWidth / 2, cursorY, { align: "center" });
  cursorY += 12;

  doc.setFontSize(9); doc.setTextColor(51, 51, 51);

  // Header info
  doc.setFont("helvetica", "bold"); doc.text("Número:", margin, cursorY);
  doc.setFont("helvetica", "normal"); doc.text("1/1", margin + 25, cursorY);
  doc.setFont("helvetica", "bold"); doc.text("Bueno por:", pageWidth / 2, cursorY);
  doc.setFont("helvetica", "normal"); doc.text(`$${vars.deposito}`, pageWidth / 2 + 25, cursorY);
  cursorY += 6;

  const city = vars.ciudad;
  doc.setFont("helvetica", "bold"); doc.text("Lugar:", margin, cursorY);
  doc.setFont("helvetica", "normal"); doc.text(city, margin + 25, cursorY);
  cursorY += 6;
  doc.setFont("helvetica", "bold"); doc.text("Fecha:", margin, cursorY);
  doc.setFont("helvetica", "normal");
  const now = nowMty();
  doc.text(format(now, "dd/MM/yyyy"), margin + 25, cursorY);
  cursorY += 12;

  // Body text from template
  doc.setFont("helvetica", "bold"); doc.setFontSize(10);
  doc.text("TEXTO DEL PAGARÉ", margin, cursorY); cursorY += 7;

  doc.setFont("helvetica", "normal"); doc.setFontSize(9);
  const pagareText = replacePlaceholders(tpl.pagare_text || DEFAULT_PAGARE, vars);
  cursorY = addWrappedText(doc, pagareText, margin, cursorY, pageWidth - margin * 2, 4.5);
  cursorY += 15;

  // Suscriptor
  doc.setFont("helvetica", "bold"); doc.setFontSize(10);
  cursorY = checkPage(doc, cursorY, 40);
  doc.text("1. DATOS DEL SUSCRIPTOR", margin, cursorY); cursorY += 7;
  doc.setFontSize(9); doc.setFont("helvetica", "normal");
  doc.text(`Nombre / Razón Social: ${customer?.name || "______________________"}`, margin, cursorY); cursorY += 5;
  doc.text(`Representante Legal: ${customer?.representante_legal || customer?.contact_person || "______________________"}`, margin, cursorY); cursorY += 5;
  doc.text(`Domicilio: ${customer?.address || "______________________"}`, margin, cursorY); cursorY += 5;
  doc.text(`RFC: ${customer?.rfc || "______________________"}`, margin, cursorY); cursorY += 12;

  doc.setDrawColor(51, 51, 51);
  doc.line(margin, cursorY, margin + 60, cursorY); cursorY += 4;
  doc.setFontSize(8);
  doc.text("Firma del Suscriptor", margin, cursorY);

  cursorY += 18;
  cursorY = checkPage(doc, cursorY, 30);
  doc.setFont("helvetica", "bold"); doc.setFontSize(10);
  doc.text("2. DATOS DEL AVAL (Opcional)", margin, cursorY); cursorY += 7;
  doc.setFontSize(9); doc.setFont("helvetica", "normal");
  doc.text("Nombre: ______________________", margin, cursorY); cursorY += 5;
  doc.text("Domicilio: ______________________", margin, cursorY); cursorY += 12;

  doc.line(margin, cursorY, margin + 60, cursorY); cursorY += 4;
  doc.setFontSize(8);
  doc.text("Firma del Aval", margin, cursorY);
}
