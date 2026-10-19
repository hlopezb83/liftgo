import { lineItemTotal } from "@/lib/domain/invoiceHelpers";
import type { LineItem } from "@/lib/domain/invoiceHelpers";

/** The two structured quote controls have stable identities, independent of
 * position or wording. This never matches historical invoice descriptions. */
export function preserveQuoteChargeIdentities(lines: LineItem[], existingLineItems: unknown): LineItem[] {
  const existing = Array.isArray(existingLineItems) ? existingLineItems as LineItem[] : [];
  if (existing.some((old) => old.line_kind === "charge" && !old.charge_kind
    && !lines.some((line) => !!line.quote_line_id && line.quote_line_id === old.quote_line_id))) {
    throw new Error("Esta cotización contiene cargos personalizados. Revisa sus partidas antes de editarla en el formulario simplificado para conservar sus vínculos.");
  }
  return lines.map((line) => {
    if (line.line_kind !== "charge" || !line.charge_kind || line.quote_line_id) return line;
    const matches = existing.filter((old) => old.line_kind === "charge" && old.charge_kind === line.charge_kind);
    if (matches.length > 1) throw new Error("Hay varios cargos del mismo tipo. Revisa las partidas de la cotización antes de guardar para conservar sus vínculos.");
    const original = matches[0];
    return original?.quote_line_id ? {
      ...original, ...line, quote_line_id: original.quote_line_id,
      description: original.description,
      quantity: original.quantity,
      total: lineItemTotal(original.quantity, line.unit_price),
    } : line;
  });
}


/** Unsupported legacy edits keep the original preview visible and cannot save. */
export function quoteChargePreview(items: LineItem[], existingLineItems: unknown): { items: LineItem[]; chargeIdentityError: string | null } {
  try { return { items: preserveQuoteChargeIdentities(items, existingLineItems), chargeIdentityError: null }; }
  catch (error) {
    return {
      items: Array.isArray(existingLineItems) ? existingLineItems as LineItem[] : items,
      chargeIdentityError: error instanceof Error ? error.message : "Revisa los cargos de la cotización antes de guardar.",
    };
  }
}
