// Barrel re-exports — preserves legacy import paths.
// Domain-specific hooks live in usePortalQuotes, usePaymentIntents,
// and usePortalCollectionAccount.
export {
  usePortalCollectionAccount,
  type PortalCollectionAccount,
} from "./usePortalCollectionAccount";
export {
  usePortalQuotes,
  usePortalQuote,
  useAcceptPortalQuote,
  useRejectPortalQuote,
} from "./usePortalQuotes";
export {
  usePortalPaymentIntents,
  useCreatePaymentIntent,
  useAdminPaymentIntents,
  useReviewPaymentIntent,
  type PaymentIntentInput,
} from "./usePaymentIntents";
