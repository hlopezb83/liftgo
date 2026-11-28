import { createEntityKeys } from "@/lib/query/createEntityKeys";
import type { CashFlowBucket } from "./cashFlowUtils";

export interface CashFlowSettings {
  id: string | null;
  initialBalance: number;
  safetyBuffer: number;
}

export interface CashFlowProjectionFilter extends Record<string, unknown> {
  weeks: number;
  initialBalance: number;
  safetyBuffer: number;
}

export interface CashFlowProjectionResult {
  buckets: CashFlowBucket[];
  /**
   * F4: documentos activos SIN fecha de vencimiento. La query los excluye
   * (`.not("due_date","is",null)`) y antes desaparecían en silencio; el conteo
   * se expone para avisar en la UI (patrón "excluir + avisar").
   */
  excludedNoDueDate: number;
  /** Documentos cuyo vencimiento cae fuera del horizonte seleccionado. */
  excludedOutOfHorizon: number;
  /** Recurring projections omitted due to missing or ambiguous invoice coverage. */
  excludedRecurringCoverage: number;
}

export const cashFlowProjectionKeys = createEntityKeys("cash_flow_projection");
