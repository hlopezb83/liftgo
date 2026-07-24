// Shim retro-compatible. Los hooks reales viven en `@/features/invoices`
// para romper el ciclo `invoices → portal`. Este archivo se mantiene mientras
// `usePortalExtras.ts` siga re-exportando esta ruta para compatibilidad interna.
export {
  type PaymentIntentInput,
  useAdminPaymentIntents,
  useCreatePaymentIntent,
  usePortalPaymentIntents,
  useReviewPaymentIntent,
} from "@/features/invoices";
