import { hasLegacyVat, sameFiscalLines } from "@/lib/fiscal/legacyVat";
import type { Quote } from "@/types/rental";
import type { buildQuotePayload } from "./quoteFormPayload";
import type { QuoteFormValues } from "../../lib/quoteFormSchema";

/** Only notes/validity edits may retain an obsolete historical fiscal snapshot. */
export function unchangedHistoricalQuoteFiscal(
  id: string | undefined,
  existing: Quote | null | undefined,
  values: QuoteFormValues,
  previous: QuoteFormValues | undefined,
): boolean {
  const { notes: _notes, validUntil: _validUntil, ...fiscalValues } = values;
  const { notes: _oldNotes, validUntil: _oldValidUntil, ...oldFiscalValues } = previous ?? {};
  return !!id && !!existing && hasLegacyVat(existing) && sameFiscalLines(fiscalValues, oldFiscalValues);
}

export function preserveHistoricalQuoteFiscal(
  payload: ReturnType<typeof buildQuotePayload>,
  existing: Quote | null | undefined,
  unchanged: boolean,
): ReturnType<typeof buildQuotePayload> {
  if (!unchanged || !existing) return payload;
  return {
    ...payload,
    line_items: existing.line_items,
    subtotal: existing.subtotal,
    tax_rate: existing.tax_rate,
    tax_amount: existing.tax_amount,
    total: existing.total,
  };
}
