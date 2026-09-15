/**
 * Subtramo 6.1 — resolución de la plantilla de contrato por organización.
 *
 * La plantilla predeterminada deja de tomarse con `limit(1)` sobre toda la
 * tabla: se resuelve siempre dentro de la organización dueña del documento o
 * del contexto verificado en servidor. Los casos de ausencia (0 filas) y
 * ambigüedad (más de una predeterminada) tienen estados explícitos; nunca se
 * usa la plantilla de otra empresa como respaldo.
 */

export type ContractTemplateIssue = "missing" | "ambiguous" | "read_error" | "organization_unresolved";

export const CONTRACT_TEMPLATE_MESSAGES: Record<ContractTemplateIssue, string> = {
  missing: "Tu empresa todavía no tiene una plantilla de contrato predeterminada.",
  ambiguous:
    "Hay más de una plantilla de contrato marcada como predeterminada en tu empresa. Deja sólo una antes de continuar.",
  read_error: "No pudimos leer la plantilla de contrato de tu empresa. Inténtalo de nuevo en unos momentos.",
  organization_unresolved:
    "No pudimos determinar la empresa de este contrato, así que no se usó ninguna plantilla.",
};

export class ContractTemplateUnavailableError extends Error {
  readonly reason: ContractTemplateIssue;
  constructor(reason: ContractTemplateIssue) {
    super(CONTRACT_TEMPLATE_MESSAGES[reason]);
    this.name = "ContractTemplateUnavailableError";
    this.reason = reason;
  }
}

/**
 * Aplica el contrato de resolución sobre las filas leídas (se piden 2 para
 * poder distinguir ausencia de ambigüedad sin revelar datos de otra empresa).
 */
export function resolveSingleDefaultTemplate<T>(rows: T[] | null | undefined): T | null {
  const list = rows ?? [];
  if (list.length > 1) throw new ContractTemplateUnavailableError("ambiguous");
  return list[0] ?? null;
}
