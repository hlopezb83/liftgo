import { z } from "zod";
import { lineItemTotal } from "@/lib/domain/invoiceHelpers";
import { lineItemSchema, type LineItemValues } from "./invoiceFormSchema";

export const CHARGE_AVAILABILITY_UNAVAILABLE = "No se pudo verificar la disponibilidad de los cargos de la cotización. Reintenta la consulta antes de seleccionar reservas o guardar.";
export const CHARGE_LEGACY_REVIEW = "Hay facturas anteriores sin vínculo verificable con los cargos de esta cotización. Revisa y concilia esas partidas antes de volver a facturar; no se asignarán por descripción.";
export const CHARGE_FIXED_DISCOUNT_REVIEW = "El cargo tiene un descuento fijo y se facturaría parcialmente. Revisa y distribuye explícitamente el descuento en la cotización antes de continuar.";

const quantity = z.number().finite().nonnegative();
const chargeSchema = z.object({
  quote_line_id: z.string().uuid(),
  line: lineItemSchema,
  quoted_quantity: quantity.positive(),
  consumed_quantity: quantity,
  remaining_quantity: quantity,
});
const quoteSchema = z.object({
  quote_id: z.string().uuid(),
  legacy_review_required: z.boolean(),
  lines: z.array(chargeSchema),
});
const availabilitySchema = z.object({ complete: z.literal(true), quotes: z.array(quoteSchema) });
export type QuoteChargeAvailability = z.infer<typeof availabilitySchema>;
export type AvailableQuoteCharge = z.infer<typeof chargeSchema>;

/** An incomplete result is an error, never evidence that nothing was billed. */
export function parseQuoteChargeAvailability(value: unknown, requestedQuoteIds: string[]): QuoteChargeAvailability {
  const parsed = availabilitySchema.safeParse(value);
  if (!parsed.success) throw new Error(CHARGE_AVAILABILITY_UNAVAILABLE);
  const expected = new Set(requestedQuoteIds);
  const seen = new Set<string>();
  for (const quote of parsed.data.quotes) {
    if (!expected.has(quote.quote_id) || seen.has(quote.quote_id)) throw new Error(CHARGE_AVAILABILITY_UNAVAILABLE);
    seen.add(quote.quote_id);
    const lineIds = new Set<string>();
    for (const charge of quote.lines) {
      if (lineIds.has(charge.quote_line_id)
        || charge.line.quote_line_id !== charge.quote_line_id
        || charge.line.line_kind !== "charge"
        || Math.abs(charge.line.quantity - charge.quoted_quantity) > 0.000001
        || Math.abs(charge.remaining_quantity - Math.max(0, charge.quoted_quantity - charge.consumed_quantity)) > 0.000001) {
        throw new Error(CHARGE_AVAILABILITY_UNAVAILABLE);
      }
      lineIds.add(charge.quote_line_id);
    }
  }
  if (seen.size !== expected.size) throw new Error(CHARGE_AVAILABILITY_UNAVAILABLE);
  return parsed.data;
}

/** Complete response for every requested quote; legacy history is not judged here. */
function resolveQuoteChargeAvailability(quoteIds: string[], availability?: QuoteChargeAvailability) {
  if (quoteIds.length === 0) return [];
  if (!availability?.complete || !Array.isArray(availability.quotes)) throw new Error(CHARGE_AVAILABILITY_UNAVAILABLE);
  return [...new Set(quoteIds)].map((id) => {
    const quote = availability.quotes.find((q) => q.quote_id === id);
    if (!quote || !Array.isArray(quote.lines)) throw new Error(CHARGE_AVAILABILITY_UNAVAILABLE);
    return quote;
  });
}

/** Adding quote charges requires verifiable history: never assign by description. */
export function requireQuoteChargeAvailability(quoteIds: string[], availability?: QuoteChargeAvailability) {
  return resolveQuoteChargeAvailability(quoteIds, availability).map((quote) => {
    if (quote.legacy_review_required) throw new Error(CHARGE_LEGACY_REVIEW);
    return quote;
  });
}

function isPartialFixedDiscount(charge: AvailableQuoteCharge, requestedQuantity: number): boolean {
  return charge.line.discount_type === "$" && (charge.line.discount ?? 0) > 0
    && (requestedQuantity < charge.quoted_quantity - 0.000001 || charge.consumed_quantity > 0.000001);
}

/** Charges belong to a quote once, regardless of how many sibling bookings were chosen. */
export function buildAvailableQuoteChargeLines(quoteIds: string[], availability?: QuoteChargeAvailability): LineItemValues[] {
  return requireQuoteChargeAvailability(quoteIds, availability).flatMap((quote) => quote.lines.flatMap((charge) => {
    if (charge.remaining_quantity <= 0) return [];
    if (isPartialFixedDiscount(charge, charge.remaining_quantity)) throw new Error(CHARGE_FIXED_DISCOUNT_REVIEW);
    return [{
      ...charge.line,
      source_quote_id: quote.quote_id,
      source_quote_line_id: charge.quote_line_id,
      quantity: charge.remaining_quantity,
      total: lineItemTotal(charge.remaining_quantity, charge.line.unit_price),
      clave_prod_serv: charge.line.clave_prod_serv || (charge.line.charge_kind === "insurance" ? "84131500" : "78101800"),
      clave_unidad: charge.line.clave_unidad || "E48",
      objeto_imp: charge.line.objeto_imp || "02",
    }];
  }));
}

/** The database accepts one row per source charge; never silently merge duplicates.
 * Like the database guard, unverifiable legacy history blocks only invoices that
 * carry charges of that quote: rent-only invoices (e.g. extensions) stay allowed. */
export function quoteChargeSelectionError(
  quoteIds: string[], lines: LineItemValues[], availability?: QuoteChargeAvailability,
): string | null {
  try {
    const quotes = resolveQuoteChargeAvailability(quoteIds, availability);
    const requested = new Map<string, number>();
    for (const line of lines) {
      if (!line.source_quote_id && !line.source_quote_line_id) continue;
      const quote = quotes.find((q) => q.quote_id === line.source_quote_id);
      if (quote?.legacy_review_required) return CHARGE_LEGACY_REVIEW;
      const charge = quote?.lines.find((c) => c.quote_line_id === line.source_quote_line_id);
      if (!charge) return "El origen de un cargo ya no coincide con la cotización seleccionada. Recarga y revisa las partidas.";
      const key = `${quote?.quote_id}:${charge.quote_line_id}`;
      if (requested.has(key)) return "El mismo cargo de cotización aparece en más de una partida. Conserva una sola partida por cargo y revisa su cantidad antes de guardar.";
      const total = line.quantity;
      requested.set(key, total);
      if (total > charge.remaining_quantity + 0.000001) return "La cantidad del cargo supera lo disponible. Otra factura o borrador ya lo está utilizando. Reintenta la consulta y revisa las cantidades.";
      if (isPartialFixedDiscount(charge, line.quantity)) return CHARGE_FIXED_DISCOUNT_REVIEW;
    }
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : CHARGE_AVAILABILITY_UNAVAILABLE;
  }
}

/** Replace only the explicitly identified charge rows when converting a quote. */
export function applyQuoteChargeAvailability(
  quoteId: string, quoteLines: LineItemValues[], availability?: QuoteChargeAvailability,
): LineItemValues[] {
  const quote = requireQuoteChargeAvailability([quoteId], availability)[0];
  const available = buildAvailableQuoteChargeLines([quoteId], availability);
  const seen = new Set<string>();
  const lines = quoteLines.flatMap((line) => {
    const charge = quote.lines.find((c) => c.quote_line_id === line.quote_line_id);
    if (!charge) {
      if (line.line_kind === "charge") throw new Error(CHARGE_AVAILABILITY_UNAVAILABLE);
      return [line];
    }
    if (seen.has(charge.quote_line_id)) throw new Error(CHARGE_AVAILABILITY_UNAVAILABLE);
    seen.add(charge.quote_line_id);
    return available.filter((item) => item.source_quote_line_id === charge.quote_line_id);
  });
  if (seen.size !== quote.lines.length) throw new Error(CHARGE_AVAILABILITY_UNAVAILABLE);
  return lines;
}

/** Source scope outlives row deletion in the editor. */
export function collectInvoiceChargeQuoteIds({
  fromQuoteId, existingQuoteId, bookingQuoteIds, originalLines, currentLines,
}: {
  fromQuoteId?: string | null;
  existingQuoteId?: string | null;
  bookingQuoteIds: string[];
  originalLines: { source_quote_id?: string }[];
  currentLines: { source_quote_id?: string }[];
}): string[] {
  return [...new Set([
    ...(fromQuoteId ? [fromQuoteId] : []),
    ...(existingQuoteId ? [existingQuoteId] : []),
    ...bookingQuoteIds,
    ...[...originalLines, ...currentLines].flatMap((line) => line.source_quote_id ? [line.source_quote_id] : []),
  ])];
}

/** Reselecting bookings keeps edited quantities; explicitly deleted rows can
 * be restored from the current authoritative balance. */
export function preserveEnteredQuoteChargeLines(available: LineItemValues[], current: LineItemValues[]): LineItemValues[] {
  return available.flatMap((line) => {
    const own = current.filter((old) => old.source_quote_id === line.source_quote_id
      && old.source_quote_line_id === line.source_quote_line_id);
    return own.length ? own : [line];
  });
}
