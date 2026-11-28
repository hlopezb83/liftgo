// Barrel público de la feature "contracts".
// Re-exporta la API consumida por otras features.
// Generado automáticamente; ampliar manualmente si hace falta.
export { SignaturePad } from "./components/SignaturePad";
export { CONTRACT_STATUS_LABELS } from "./lib/contractStatusLabels";
export {
  type ChecklistSection,
  type ContractClause,
  useDefaultContractTemplate,
  useUpdateLegalTemplateOverrides,
} from "./hooks/useContractTemplates";

export { EMPTY_LEGAL_TEMPLATE_OVERRIDES, type LegalTemplateOverrides } from "./lib/legalTemplateOverrides";
