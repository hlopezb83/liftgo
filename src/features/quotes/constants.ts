import { STATUS_LABELS } from "@/lib/constants";

/**
 * Labels de estado específicos para cotizaciones.
 * Override necesario: `sent` significa "Enviada" en cotizaciones,
 * pero globalmente STATUS_LABELS lo etiqueta como "Sin Pagar" (factura).
 */
export const QUOTE_STATUS_LABELS: Record<string, string> = {
  ...STATUS_LABELS,
  sent: "Enviada",
  // V3-5: la DB usa 'rejected' (constraint quotes_status_dominio); 'declined'
  // era el valor viejo del cliente. Etiqueta explícita para no depender del
  // orden del spread global.
  rejected: "Rechazada",
  cancelled: "Cancelada",
  // M-8: la cotización ya generó sus reservas.
  converted: "Convertida",
};

export const quoteStatusLabel = (status: string): string =>
  QUOTE_STATUS_LABELS[status] ?? status;
