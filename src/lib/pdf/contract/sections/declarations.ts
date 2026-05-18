import type jsPDF from "jspdf";
import { replacePlaceholders } from "@/lib/domain/templateUtils";
import { addWrappedText, checkPage } from "@/lib/pdf/shared";
import type { TemplateData } from "../fetchers";

interface CustomerForDeclarations {
  representante_legal?: string | null;
}

export function drawDeclarations(
  doc: jsPDF,
  tpl: TemplateData,
  customer: CustomerForDeclarations | null,
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
