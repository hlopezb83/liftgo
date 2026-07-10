/**
 * Tipos y helpers compartidos para partidas embebidas en JSONB
 * (invoices.line_items, quotes.line_items, portales, etc.).
 *
 * Antes cada consumidor redeclaraba `LineItem` y hacía su propio
 * `Array.isArray(json) ? json as LineItem[] : []`.
 */

export interface PortalLineItem {
  description?: string;
  quantity?: number;
  unit_price?: number;
  amount?: number;
}

/** Normaliza un JSONB a un arreglo de partidas (nunca lanza). */
export function parseLineItems(value: unknown): PortalLineItem[] {
  return Array.isArray(value) ? (value as PortalLineItem[]) : [];
}
