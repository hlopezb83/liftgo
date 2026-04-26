import type jsPDF from "jspdf";
import { addWrappedText, checkPage } from "@/lib/pdf/shared";
import type { ContractData } from "../fetchers";

interface CompanyForSignatures { razon_social?: string | null }
interface CustomerForSignatures {
  name?: string | null;
  representante_legal?: string | null;
}

export function drawSignatures(
  doc: jsPDF,
  contract: ContractData,
  company: CompanyForSignatures | null,
  customer: CustomerForSignatures | null,
  vars: Record<string, string>,
  startY: number,
  city: string,
  formattedDate: string,
): void {
  void vars;
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 20;
  let cursorY = checkPage(doc, startY, 45) + 5;

  doc.setFontSize(9);
  cursorY = addWrappedText(doc, `Leído el presente contrato, lo firman en ${city}, el día ${formattedDate}.`, margin, cursorY, pageWidth - margin * 2, 4.5);
  cursorY += 12;

  doc.setDrawColor(51, 51, 51); doc.setLineWidth(0.5);
  const col1 = margin;
  const col2 = pageWidth / 2 + 5;
  const lineWidth = (pageWidth - margin * 2 - 10) / 2;

  doc.line(col1, cursorY, col1 + lineWidth, cursorY);
  doc.line(col2, cursorY, col2 + lineWidth, cursorY);
  cursorY += 4;
  doc.setFontSize(8);
  doc.text("EL ARRENDADOR", col1, cursorY);
  doc.text("EL ARRENDATARIO", col2, cursorY);
  cursorY += 4;
  doc.text(company?.razon_social || "", col1, cursorY);
  doc.text(customer?.name || contract.customer_name || "", col2, cursorY);
  if (customer?.representante_legal) {
    cursorY += 4;
    doc.text(`Rep. Legal: ${customer.representante_legal}`, col2, cursorY);
  }

  cursorY += 15;
  cursorY = checkPage(doc, cursorY, 25);
  doc.line(col1, cursorY, col1 + lineWidth, cursorY);
  doc.line(col2, cursorY, col2 + lineWidth, cursorY);
  cursorY += 4;
  doc.text("TESTIGO 1", col1, cursorY);
  doc.text("TESTIGO 2", col2, cursorY);
  cursorY += 4;
  doc.text(contract.witness_1 || "", col1, cursorY);
  doc.text(contract.witness_2 || "", col2, cursorY);
}
