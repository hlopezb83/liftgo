/**
 * Re-export shim — los DTOs canónicos viven en `@/lib/domain/customerTypes`
 * para evitar que `lib/pdf` importe desde `features/*`.
 */
export type {
  CustomerSummary,
} from "@/lib/domain/customerTypes";
