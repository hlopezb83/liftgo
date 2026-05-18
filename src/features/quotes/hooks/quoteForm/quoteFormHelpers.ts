// Barrel re-export to mantener compatibilidad con imports existentes.
// Las implementaciones viven ahora en archivos por responsabilidad.
export { buildSaleItems, buildRentalItems } from "./quoteFormBuilders";
export type { EquipmentModel, SaleLine, RentalLine } from "./quoteFormBuilders";
export { validateQuoteForm } from "./quoteFormValidation";
export { buildQuotePayload, type BuildQuotePayloadArgs } from "./quoteFormPayload";
