import type jsPDF from "jspdf";
import { replacePlaceholders } from "@/lib/domain/templateUtils";
import { addWrappedText, checkPage } from "@/lib/pdf/shared";
import type { TemplateData } from "../fetchers";

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
