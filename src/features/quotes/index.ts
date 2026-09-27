// Barrel público de la feature "quotes".
// Re-exporta la API consumida por otras features.
// Generado automáticamente; ampliar manualmente si hace falta.
export * from "./hooks/quoteDetail/useQuoteSaleAssignmentStatus";
export * from "./hooks/quotes/useQuotes";
export { formatQuoteTotal } from "./lib/quoteDisplay";
export { allocateQuotedRentalLines, hasQuotedDiscount } from "./lib/quotedRentalAllocation";
export type { QuotedRentalBooking, QuotedRentalUnit, RentalQuoteSource } from "./lib/quotedRentalAllocation";
