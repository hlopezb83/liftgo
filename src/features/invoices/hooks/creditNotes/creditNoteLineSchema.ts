import { z } from "zod";

/**
 * Fix 8.1: espejo zod del cap por línea aplicado en `useCreditNoteForm.updateLine`.
 * Recibe las líneas originales de la factura para acotar `quantity`/`unit_price`
 * de cada línea de la nota de crédito con `superRefine`.
 */
export const creditNoteLineSchema = z.object({
  quantity: z.number(),
  unit_price: z.number(),
  _selected: z.boolean(),
});

export type CreditNoteLineInput = z.infer<typeof creditNoteLineSchema>;

export function buildCreditNoteLinesSchema(
  originalLines: Array<{ quantity: number; unit_price: number }>,
) {
  return z.array(creditNoteLineSchema).superRefine((lines, ctx) => {
    lines.forEach((line, idx) => {
      const src = originalLines[idx];
      if (!src) return;
      if (line.quantity > src.quantity) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [idx, "quantity"],
          message: `Máximo: ${src.quantity} unidades facturadas`,
        });
      }
      if (line.unit_price > src.unit_price) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [idx, "unit_price"],
          message: `Máximo: $${src.unit_price} por unidad`,
        });
      }
    });
  });
}
