// Barrel público de la feature "contracts".
// Re-exporta la API consumida por otras features.
// Generado automáticamente; ampliar manualmente si hace falta.
export * from "./components/contracts/SignaturePad";
export { CONTRACT_STATUS_LABELS } from "./lib/contractStatusLabels";
export * from "./hooks/useContractTemplates";
export * from "./hooks/useContracts";
export { EMPTY_LEGAL_TEMPLATE_OVERRIDES, type LegalTemplateOverrides } from "./lib/legalTemplateOverrides";
