// Re-export barrel maintaining backward compatibility for existing imports.
export type { ContractData, TemplateData } from "./fetchers";
export { fetchRelatedData, fetchTemplate } from "./fetchers";
export { buildPlaceholderVars, resolvePagareAmount } from "./placeholders";
