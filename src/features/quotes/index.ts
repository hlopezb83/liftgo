// Barrel público de la feature "quotes".
// Re-exporta la API consumida por otras features.
// Generado automáticamente; ampliar manualmente si hace falta.
export { useQuoteSaleAssignmentStatus } from "./hooks/quoteDetail/useQuoteSaleAssignmentStatus";
export {
  quoteKeys,
  type QuoteListItem,
  useQuote,
  useQuotes,
  useQuotesByIds,
} from "./hooks/useQuotes";
export { formatQuoteTotal } from "./lib/quoteDisplay";
export { allocateQuotedRentalLines, hasQuotedDiscount } from "./lib/quotedRentalAllocation";
export type { QuotedRentalBooking, QuotedRentalUnit, RentalQuoteSource } from "./lib/quotedRentalAllocation";
export { useCrmQuote, useCrmQuoteNumbers, useCrmQuoteOptions } from "./hooks/useCrmQuotes";
export type { CrmQuote } from "./hooks/useCrmQuotes";
