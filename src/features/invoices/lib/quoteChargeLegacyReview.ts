import { z } from "zod";

export const LEGACY_REVIEW_UNAVAILABLE = "No se pudo verificar la revisión histórica completa. Reintenta la consulta.";
export const legacyClassifications = {
  charge: "Cargo de esta cotización",
  rental: "Renta o venta de equipo",
  not_quote_charge: "No corresponde a un cargo de esta cotización",
} as const;

const quantity = z.number().finite().nonnegative();
const reviewSchema = z.object({
  id: z.string().uuid(),
  classification: z.enum(["charge", "rental", "not_quote_charge"]),
  quote_line_id: z.string().uuid().nullable(),
  quantity: quantity.positive().nullable(),
  reason: z.string().min(1),
  evidence: z.string().min(1),
  actor_id: z.string().uuid(),
  created_at: z.string().min(1),
});
const historySchema = reviewSchema.extend({
  reversed_at: z.string().nullable(),
  reversal_reason: z.string().nullable(),
  reversal_evidence: z.string().nullable(),
  reversed_by: z.string().uuid().nullable(),
});
const lineSchema = z.object({
  line_index: z.number().int().nonnegative(),
  line: z.unknown().refine((value) => value !== undefined),
  line_hash: z.string().regex(/^[a-f0-9]{64}$/i),
  pending: z.boolean(),
  reviewable: z.boolean(),
  blocked_reason: z.string().nullable(),
  review: reviewSchema.nullable(),
  history: z.array(historySchema),
});
const invoiceSchema = z.object({
  invoice_id: z.string().uuid(),
  invoice_number: z.string().nullable(),
  status: z.string().nullable(),
  cfdi_status: z.string().nullable(),
  cancellation_status: z.string().nullable(),
  active: z.boolean(),
  reviewable: z.boolean(),
  empty_positive: z.boolean(),
  lines: z.array(lineSchema),
});
const schema = z.object({
  complete: z.literal(true),
  quote_id: z.string().uuid(),
  quote_number: z.string(),
  can_reconcile: z.boolean(),
  charges: z.array(z.object({
    quote_line_id: z.string().uuid(),
    line: z.record(z.string(), z.unknown()),
    quoted_quantity: quantity.positive(),
    consumed_quantity: quantity,
    remaining_quantity: quantity,
  })),
  invoices: z.array(invoiceSchema),
});

export type LegacyChargeReview = z.infer<typeof schema>;
export type LegacyReviewInvoice = z.infer<typeof invoiceSchema>;
export type LegacyReviewLine = z.infer<typeof lineSchema>;
export type LegacyClassification = keyof typeof legacyClassifications;
export type LegacyReviewSelection = { invoice: LegacyReviewInvoice; line: LegacyReviewLine; reverse: boolean };

export function originalLineField(line: unknown, key: string): unknown {
  return line && typeof line === "object" && !Array.isArray(line)
    ? (line as Record<string, unknown>)[key] : undefined;
}

/** A truncated response or a changed scope must never offer review actions. */
export function parseLegacyChargeReview(value: unknown, quoteId: string): LegacyChargeReview {
  const parsed = schema.safeParse(value);
  if (!parsed.success || parsed.data.quote_id !== quoteId) throw new Error(LEGACY_REVIEW_UNAVAILABLE);
  const data = parsed.data;
  const invoiceIds = new Set(data.invoices.map((invoice) => invoice.invoice_id));
  const chargeIds = new Set(data.charges.map((charge) => charge.quote_line_id));
  if (invoiceIds.size !== data.invoices.length || chargeIds.size !== data.charges.length) throw new Error(LEGACY_REVIEW_UNAVAILABLE);
  for (const invoice of data.invoices) {
    if (new Set(invoice.lines.map((line) => line.line_index)).size !== invoice.lines.length) throw new Error(LEGACY_REVIEW_UNAVAILABLE);
    for (const line of invoice.lines) {
      if (line.pending && line.review) throw new Error(LEGACY_REVIEW_UNAVAILABLE);
      const review = line.review;
      if (review && (review.classification === "charge"
        ? review.quote_line_id === null || review.quantity === null
        : review.quote_line_id !== null || review.quantity !== null)) throw new Error(LEGACY_REVIEW_UNAVAILABLE);
    }
  }
  return data;
}

export function reviewErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") return error.message;
  return "No se pudo guardar la revisión. Reintenta la misma solicitud; se conservará su identificador para evitar duplicados.";
}
