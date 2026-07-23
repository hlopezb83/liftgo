/**
 * DTOs del dominio de contratos (cláusulas y checklist).
 * Vive en `lib/domain` para que `lib/pdf/contract` y los editores
 * en `features/*` los consuman sin acoplarse a features.
 */
export interface ContractClause {
  title: string;
  body: string;
}

export interface ChecklistSection {
  title: string;
  items: string[];
}
