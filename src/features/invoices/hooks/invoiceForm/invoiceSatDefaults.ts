import type { LineItemValues } from "../../lib/invoiceFormSchema";

/** Source context is separate from editable rows, so deleting them cannot hide a sale. */
export interface InvoiceLineItemSource {
  key?: string;
  quoteId?: string | null;
  quoteType?: string | null;
  originalLines?: unknown;
  isLoading?: boolean;
}

interface InvoiceSatSourceArgs {
  invoiceId?: string;
  existing?: { quote_id?: string | null; line_items?: unknown } | null;
  isLoadingInvoice?: boolean;
  quoteId: string | null;
  quote?: { id?: string; quote_type?: string; line_items?: unknown } | null;
  extensionId: string | null;
  damageId: string | null;
}

export function invoiceLineItemSource({ invoiceId, existing, isLoadingInvoice, quoteId, quote, extensionId, damageId }: InvoiceSatSourceArgs): InvoiceLineItemSource {
  // A stale previous quote response must not supply the next source's type.
  const matchingQuote = quote?.id === quoteId ? quote : undefined;
  const original = invoiceId ? existing : matchingQuote;
  return {
    key: invoiceId ? `invoice:${invoiceId}` : JSON.stringify([quoteId, extensionId, damageId]),
    quoteId: invoiceId ? existing?.quote_id : quoteId,
    quoteType: invoiceId ? undefined : matchingQuote?.quote_type,
    originalLines: original?.line_items,
    isLoading: !!invoiceId && isLoadingInvoice,
  };
}

export function hasSaleLines(lines: unknown): boolean {
  return Array.isArray(lines) && lines.some((line) => line?.line_kind === "sale");
}

export function hasSatSelectionRequiredLines(lines: unknown): boolean {
  return Array.isArray(lines) && lines.some((line) => line?.sat_selection_required === true);
}

export function isSaleInvoiceSource(source: InvoiceLineItemSource): boolean {
  return source.quoteType === "sale" || hasSaleLines(source.originalLines);
}

export function lineSourceQuoteIds(lines: unknown): string[] {
  if (!Array.isArray(lines)) return [];
  return lines.flatMap((line) => typeof line?.source_quote_id === "string" && line.source_quote_id.trim() ? [line.source_quote_id] : []);
}

export function requiresExplicitInvoiceSat(source: InvoiceLineItemSource, hasSale: boolean, rememberedQuoteIds: string[] = []): boolean {
  const quoteIds = [...lineSourceQuoteIds(source.originalLines), ...rememberedQuoteIds];
  if (source.quoteId) quoteIds.push(source.quoteId);
  return hasSale || hasSatSelectionRequiredLines(source.originalLines) || !!source.isLoading
    || quoteIds.some((id) => id !== source.quoteId || source.quoteType !== "rental");
}

/** Preserve supplied strings, including historical rental-looking codes. Their
 * presence does not prove SAT catalog validity or a prior manual selection. */
export function quoteLineSatDefaults(line: LineItemValues, source: InvoiceLineItemSource) {
  const explicit = line.sat_selection_required === true
    || requiresExplicitInvoiceSat(source, isSaleInvoiceSource(source) || line.line_kind === "sale", lineSourceQuoteIds([line]));
  return {
    clave_prod_serv: explicit ? line.clave_prod_serv ?? "" : line.clave_prod_serv || "78181500",
    clave_unidad: explicit ? line.clave_unidad ?? "" : line.clave_unidad || "DAY",
  };
}
