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

/**
 * Bug 8: labels PLURALES para las pestañas-filtro de la lista (cada pestaña
 * representa un conjunto). El badge de una cotización individual sigue usando
 * el singular de QUOTE_STATUS_LABELS.
 */
export const QUOTE_STATUS_TAB_LABELS: Record<string, string> = {
  all: "Todas",
  draft: "Borradores",
  sent: "Enviadas",
  accepted: "Aceptadas",
  converted: "Convertidas",
  rejected: "Rechazadas",
  expired: "Expiradas",
  cancelled: "Canceladas",
};
