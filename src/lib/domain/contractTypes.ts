/**
 * Tipos compartidos del dominio de contratos (cláusulas y checklist).
 * Centralizados en `lib/domain` para que `lib/pdf/contract` y los editores
 * en `features/operations` los consuman sin acoplarse al hook de features.
 */
export interface ContractClause {
  title: string;
  body: string;
}

export interface ChecklistSection {
  title: string;
  items: string[];
}
