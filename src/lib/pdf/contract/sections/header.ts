import type jsPDF from "jspdf";
import type { ContractData } from "../fetchers";

interface CompanyHeaderInfo {
  razon_social?: string | null;
  rfc?: string | null;
  lugar_expedicion?: string | null;
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
