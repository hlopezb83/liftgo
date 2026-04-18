// Thin barrel — re-exports the modular contract PDF helpers.
// See src/lib/pdf/contract/ for implementations.
export type { ContractData, TemplateData } from "./pdf/contract/data";
export {
  buildPlaceholderVars, fetchRelatedData, fetchTemplate, fetchLogoBase64,
} from "./pdf/contract/data";
export { generateContractPages } from "./pdf/contract/contractPage";
export { generateChecklistPage } from "./pdf/contract/checklistPage";
export { generatePagarePage } from "./pdf/contract/pagarePage";

export type PDFMode = "full" | "contract" | "checklist" | "pagare";
