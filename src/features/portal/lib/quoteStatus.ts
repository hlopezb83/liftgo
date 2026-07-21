/**
 * Bloque 3.2/3.6 (R4): las cotizaciones tienen su propio ciclo de vida
 * (draft/sent/accepted/rejected/expired) y no comparten labels con facturas.
 * En particular `sent` NO es "Sin Pagar" (label de facturas) sino "Enviada".
 * Se define aquí para usar como label override en <StatusBadge>.
 */
export const QUOTE_STATUS_LABELS: Record<string, string> = {
  draft: "Borrador",
  sent: "Enviada",
  accepted: "Aceptada",
  rejected: "Rechazada",
  declined: "Rechazada",
  expired: "Vencida",
  cancelled: "Cancelada",
};

export function quoteStatusLabel(status: string | null | undefined): string {
  if (!status) return "—";
  return QUOTE_STATUS_LABELS[status] ?? "—";
}
