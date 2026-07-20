import { z } from "zod";

/**
 * UX-M1 (fundamento): schema Zod para QuoteForm.
 *
 * Refleja el shape actual de `useQuoteFormState`:
 *   - `quoteType`: renta o venta (exclusivos — sólo se valida el bloque activo).
 *   - `rentalLines[]` / `saleLines[]`: partidas dinámicas con cantidad, tarifas y descuento.
 *   - `dateRange`: rango de vigencia — obligatorio para renta, opcional para venta.
 *   - `logistics`: opcional (checkbox + costo).
 *
 * Este schema es el contrato para la migración de UI a RHF en Ola 3.5;
 * en esta ola sólo se entregan schema + tests.
 */

const nonEmptyId = z.string().trim().min(1, "Requerido");
const positiveInt = z.number().int().positive("Debe ser mayor a 0");
const nonNegative = z.number().min(0, "No puede ser negativo");
const positive = z.number().positive("Debe ser mayor a 0");

export const rentalLineSchema = z.object({
  modelId: nonEmptyId.refine(v => v.length > 0, "Selecciona un modelo"),
  quantity: positiveInt,
  dailyRate: nonNegative,
  weeklyRate: nonNegative,
  monthlyRate: positive,
  discount: nonNegative,
  discountType: z.enum(["%", "$"]),
});

export const saleLineSchema = z.object({
  modelId: nonEmptyId.refine(v => v.length > 0, "Selecciona un modelo"),
  quantity: positiveInt,
  unitPrice: positive,
  discount: nonNegative,
  discountType: z.enum(["%", "$"]),
});

const dateRangeSchema = z.object({
  from: z.date().optional(),
  to: z.date().optional(),
}).optional();

export const quoteFormSchema = z.object({
  quoteType: z.enum(["rental", "sale"]),
  customerId: nonEmptyId,
  customerName: z.string().default(""),
  currency: z.enum(["MXN", "USD"]),
  taxRate: z.string().regex(/^\d+(\.\d+)?$/, "Tasa inválida"),
  notes: z.string().default(""),
  validUntil: z.date().optional(),
  dateRange: dateRangeSchema,
  rentalLines: z.array(rentalLineSchema).default([]),
  saleLines: z.array(saleLineSchema).default([]),
  includeLogistics: z.boolean().default(false),
  logisticsCost: nonNegative.default(0),
}).superRefine((val, ctx) => {
  if (val.quoteType === "rental") {
    if (val.rentalLines.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["rentalLines"],
        message: "Agrega al menos una partida",
      });
    }
    if (!val.dateRange?.from || !val.dateRange?.to) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["dateRange"],
        message: "Selecciona el rango de renta",
      });
    } else if (val.dateRange.to < val.dateRange.from) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["dateRange"],
        message: "La fecha final debe ser posterior a la inicial",
      });
    }
  } else if (val.quoteType === "sale") {
    if (val.saleLines.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["saleLines"],
        message: "Agrega al menos una partida",
      });
    }
  }

  if (val.includeLogistics && val.logisticsCost <= 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["logisticsCost"],
      message: "Ingresa el costo logístico",
    });
  }
});

export type QuoteFormValues = z.infer<typeof quoteFormSchema>;
export type RentalLineValues = z.infer<typeof rentalLineSchema>;
export type SaleLineValues = z.infer<typeof saleLineSchema>;
