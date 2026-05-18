import type jsPDF from "jspdf";
import { format } from "date-fns";
import { nowMty } from "@/lib/utils";
import { replacePlaceholders } from "@/lib/domain/templateUtils";
import { addWrappedText } from "@/lib/pdf/shared";
import { DEFAULT_INTRO } from "@/lib/pdf/contract/data-templates";
import {
  drawContractHeader, drawDeclarations, drawClauses, drawSignatures,
} from "./contractSections";
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
interface ForkliftRef { id?: string }

export function generateContractPages(
  doc: jsPDF,
  contract: ContractData,
  company: CompanyHeaderInfo | null,
  customer: CustomerForSignatures | null,
  forklift: ForkliftRef | null,
  logoBase64: string | null,
  tpl: TemplateData,
  vars: Record<string, string>,
): void {
  void forklift;
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 20;

  let cursorY = drawContractHeader(doc, company, contract, logoBase64, 20);

  doc.setFontSize(9); doc.setFont("helvetica", "normal"); doc.setTextColor(51, 51, 51);
  cursorY = addWrappedText(doc, replacePlaceholders(tpl.intro_text || DEFAULT_INTRO, vars), margin, cursorY, pageWidth - margin * 2, 4.5);
  cursorY += 5;

  cursorY = drawDeclarations(doc, tpl, customer, vars, cursorY);
  cursorY = drawClauses(doc, tpl, vars, cursorY);

  drawSignatures(doc, contract, company, customer, vars, cursorY, vars.ciudad, format(nowMty(), "dd/MM/yyyy"));
}
