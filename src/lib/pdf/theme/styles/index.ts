/**
 * Barrel re-export for PDF stylesheets. Split per document family:
 * - `shared`  → sharedStyles (invoice / quote / statement / income)
 * - `contract` → contractStyles (contract, checklist annex, pagaré annex)
 */
export { sharedStyles } from "./shared";
export { contractStyles } from "./contract";
