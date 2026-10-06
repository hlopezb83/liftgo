// Barrel re-exports — preserves legacy import paths.
// Domain-specific hooks live in usePortalQuotes, usePaymentIntents,
// and usePortalCollectionAccount.
export {
  usePortalCollectionAccount,
} from "./usePortalCollectionAccount";
export {
  usePortalQuotesPage,
  usePortalQuote,
  useAcceptPortalQuote,
  useRejectPortalQuote,
} from "./usePortalQuotes";
export {
  usePortalPaymentIntents,
  useCreatePaymentIntent,
} from "./usePaymentIntents";
