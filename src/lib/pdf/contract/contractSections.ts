import type jsPDF from "jspdf";
import { replacePlaceholders } from "@/lib/templateUtils";
import { addWrappedText, checkPage } from "@/lib/pdf/shared";
import type { ContractData, TemplateData } from "./fetchers";

interface CompanyHeaderInfo {
  razon_social?: string | null;
  rfc?: string | null;
  lugar_expedicion?: string | null;
}

interface CustomerForSignatures {
  name?: string | null;
  representante_legal?: string | null;
}

export function drawContractHeader(
  doc: jsPDF,
  company: CompanyHeaderInfo | null,
  contract: ContractData,
  logoBase64: string | null,
  startY: number,
): number {
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 20;
  let cursorY = startY;

  if (logoBase64) doc.addImage(logoBase64, "PNG", margin, cursorY - 5, 18, 18);
  const textX = logoBase64 ? margin + 22 : margin;
  doc.setFontSize(10); doc.setTextColor(51, 51, 51); doc.setFont("helvetica", "bold");
  doc.text(company?.razon_social || "Empresa", textX, cursorY);
  doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(102, 102, 102);
  if (company?.rfc) doc.text(`RFC: ${company.rfc} | C.P.: ${company.lugar_expedicion || ""}`, textX, cursorY + 5);
  doc.setFontSize(10); doc.setTextColor(102, 102, 102);
  doc.text(contract.contract_number, pageWidth - margin, cursorY, { align: "right" });
  cursorY += 20;

  doc.setFontSize(14); doc.setTextColor(51, 51, 51); doc.setFont("helvetica", "bold");
  doc.text("CONTRATO DE ARRENDAMIENTO DE MAQUINARIA Y EQUIPO", pageWidth / 2, cursorY, { align: "center" });
  cursorY += 10;

  return cursorY;
}

export function drawDeclarations(
  doc: jsPDF,
  tpl: TemplateData,
  customer: CustomerForSignatures | null,
  vars: Record<string, string>,
  startY: number,
): number {
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 20;
  let cursorY = startY;

  doc.setFont("helvetica", "bold"); doc.setFontSize(11);
  cursorY = checkPage(doc, cursorY);
  doc.text("I. DECLARACIONES", margin, cursorY); cursorY += 6;

  doc.setFontSize(9); doc.setFont("helvetica", "bold");
  doc.text("Declara EL ARRENDADOR:", margin, cursorY); cursorY += 5;
  doc.setFont("helvetica", "normal");
  for (const declaration of tpl.declarations_landlord) {
    cursorY = checkPage(doc, cursorY);
    cursorY = addWrappedText(doc, `• ${replacePlaceholders(declaration, vars)}`, margin + 3, cursorY, pageWidth - margin * 2 - 6, 4.5);
  }
  cursorY += 3;

  doc.setFont("helvetica", "bold");
  cursorY = checkPage(doc, cursorY);
  doc.text("Declara EL ARRENDATARIO:", margin, cursorY); cursorY += 5;
  doc.setFont("helvetica", "normal");
  const tenantDeclarations = [...tpl.declarations_tenant];
  if (customer?.representante_legal && !tenantDeclarations.some((d: string) => d.includes("{representante_legal}"))) {
    tenantDeclarations.push(`Representada legalmente por: {representante_legal}.`);
  }
  for (const declaration of tenantDeclarations) {
    cursorY = checkPage(doc, cursorY);
    cursorY = addWrappedText(doc, `• ${replacePlaceholders(declaration, vars)}`, margin + 3, cursorY, pageWidth - margin * 2 - 6, 4.5);
  }
  return cursorY + 5;
}

export function drawClauses(
  doc: jsPDF,
  tpl: TemplateData,
  vars: Record<string, string>,
  startY: number,
): number {
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 20;
  let cursorY = startY;

  doc.setFont("helvetica", "bold"); doc.setFontSize(11);
  cursorY = checkPage(doc, cursorY);
  doc.text("II. CLÁUSULAS", margin, cursorY); cursorY += 7;

  doc.setFontSize(9);
  for (const clause of tpl.clauses) {
    cursorY = checkPage(doc, cursorY, 20);
    doc.setFont("helvetica", "bold");
    doc.text(replacePlaceholders(clause.title, vars), margin, cursorY); cursorY += 5;
    doc.setFont("helvetica", "normal");
    cursorY = addWrappedText(doc, replacePlaceholders(clause.body, vars), margin, cursorY, pageWidth - margin * 2, 4.5);
    cursorY += 4;
  }
  return cursorY;
}

export function drawSignatures(
  doc: jsPDF,
  contract: ContractData,
  company: CompanyHeaderInfo | null,
  customer: CustomerForSignatures | null,
  vars: Record<string, string>,
  startY: number,
  city: string,
  formattedDate: string,
): void {
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
  // suppress unused vars param
  void vars;
}
