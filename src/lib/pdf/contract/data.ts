// Re-export barrel maintaining backward compatibility for existing imports.
export type { ContractData, TemplateData } from "./fetchers";
export { fetchRelatedData, fetchTemplate, fetchLogoBase64 } from "./fetchers";
export { buildPlaceholderVars } from "./placeholders";
