/**
 * Re-export shim — los DTOs canónicos viven en `@/lib/domain/contractTypes`
 * para evitar que `lib/pdf/contract` importe desde `features/*`.
 */
export type { ContractClause, ChecklistSection } from "@/lib/domain/contractTypes";
