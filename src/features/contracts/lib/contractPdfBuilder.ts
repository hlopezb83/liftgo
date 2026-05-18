import type { ContractData, PDFMode } from "@/lib/pdf/contractGenerator";

/**
 * Construye el PDF de contrato según el modo seleccionado.
 * Aísla la lógica de generación para mantener el botón con baja complejidad.
 */
export async function buildContractPdf(contract: ContractData, mode: PDFMode): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const {
    fetchRelatedData, fetchTemplate, fetchLogoBase64,
    buildPlaceholderVars,
    generateContractPages, generateChecklistPage, generatePagarePage,
  } = await import("@/lib/pdf/contractGenerator");

  const [{ company, customer, forklift }, tpl] = await Promise.all([
    fetchRelatedData(contract),
    fetchTemplate(),
  ]);

  const vars = buildPlaceholderVars(contract, company, customer, forklift);
  const logoBase64 = await fetchLogoBase64(company?.logo_url);
  const doc = new jsPDF();

  const wantsContract = mode === "full" || mode === "contract";
  const wantsChecklist = mode === "full" || mode === "checklist";
  const wantsPagare = mode === "full" || mode === "pagare";

  if (wantsContract) {
    generateContractPages(doc, contract, company, customer, forklift, logoBase64, tpl, vars);
  }
  if (wantsChecklist) {
    generateChecklistPage(doc, contract, company, customer, forklift, tpl);
    if (mode === "checklist") doc.deletePage(1);
  }
  if (wantsPagare) {
    generatePagarePage(doc, contract, company, customer, tpl, vars);
    if (mode === "pagare") doc.deletePage(1);
  }

  const suffix = mode === "full" ? "" : `-${mode}`;
  doc.save(`${contract.contract_number}${suffix}.pdf`);
}
