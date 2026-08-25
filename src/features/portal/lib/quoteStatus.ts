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
  // M-8: la cotización ya se convirtió en reservas.
  converted: "Convertida",
  rejected: "Rechazada",
  expired: "Vencida",
  cancelled: "Cancelada",
};

export function quoteStatusLabel(status: string | null | undefined): string {
  if (!status) return "—";
  return QUOTE_STATUS_LABELS[status] ?? "—";
}

/**
 * F8 (Sprint M2): vigencia de la cotización contra la medianoche del negocio
 * (Monterrey), no la medianoche local del navegador del cliente. `today`
 * debe venir de `nowMty()`; `validUntil`/parseado con `parseDateLocal` para
 * evitar drift de TZ en el propio `valid_until`.
 */
export function isQuotePastValidity(validUntilDate: Date | null, today: Date): boolean {
  if (!validUntilDate) return false;
  const startOfTodayMty = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  return validUntilDate.getTime() < startOfTodayMty;
}
