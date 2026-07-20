// Barrel de helpers puros de QuoteForm.
// La validación vive en `../../lib/quoteFormSchema` (fuente de verdad).
export { buildSaleItems, buildRentalItems } from "./quoteFormBuilders";
export type { EquipmentModel, SaleLine, RentalLine } from "./quoteFormBuilders";
export { buildQuotePayload, type BuildQuotePayloadArgs } from "./quoteFormPayload";
