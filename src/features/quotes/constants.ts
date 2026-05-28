import { STATUS_LABELS } from "@/lib/constants";

/**
 * Labels de estado específicos para cotizaciones.
 * Override necesario: `sent` significa "Enviada" en cotizaciones,
 * pero globalmente STATUS_LABELS lo etiqueta como "Sin Pagar" (factura).
 */
export const QUOTE_STATUS_LABELS: Record<string, string> = {
  ...STATUS_LABELS,
  sent: "Enviada",
};

export const quoteStatusLabel = (status: string): string =>
  QUOTE_STATUS_LABELS[status] ?? status;
