// Thin barrel — re-exports the modular contract PDF helpers.
// See src/lib/pdf/contract/ for implementations.
export type { ContractData, TemplateData } from "./contract/data";
export {
  buildPlaceholderVars, fetchRelatedData, fetchTemplate, fetchLogoBase64,
} from "./contract/data";
export { generateContractPages } from "./contract/contractPage";
export { generateChecklistPage } from "./contract/checklistPage";
export { generatePagarePage } from "./contract/pagarePage";

export type PDFMode = "full" | "contract" | "checklist" | "pagare";
