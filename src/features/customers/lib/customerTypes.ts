/**
 * Re-export shim — los DTOs canónicos viven en `@/lib/domain/customerTypes`
 * para evitar que `lib/pdf` importe desde `features/*`.
 */
export type {
  CustomerSummary,
  CustomerSummaryBooking,
  CustomerSummaryInvoice,
} from "@/lib/domain/customerTypes";
