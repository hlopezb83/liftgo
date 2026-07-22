import { z } from "zod";

/**
 * UX-M1: schema Zod para QuoteForm (fuente de verdad de la validación).
 *
 * Refleja el shape del formulario:
 *   - `quoteType`: renta o venta (exclusivos — sólo se valida el bloque activo).
 *   - `rentalLines[]` / `saleLines[]`: partidas dinámicas con cantidad, tarifas y descuento.
 *   - `dateRange`: rango de vigencia — obligatorio para renta, opcional para venta.
 *   - `logistics`: opcional (checkbox + costo).
 *
 * Regla renta: cada línea debe tener al menos una tarifa > 0 (diaria/semanal/mensual),
 * consistente con el comportamiento histórico del app (no exigimos monthlyRate>0).
 */

const nonEmptyId = z.string().trim().min(1, "Selecciona un modelo");
const positiveInt = z.number().int().positive("Debe ser mayor a 0");
const nonNegative = z.number().min(0, "No puede ser negativo");
const positive = z.number().positive("Debe ser mayor a 0");

// Base laxo — permite que la partida inactiva (rental cuando quoteType='sale', y viceversa)
// conserve valores neutros sin fallar la validación. La validación estricta se hace en
// `superRefine` sólo para el bloque activo.
const rentalLineBase = z.object({
  modelId: z.string(),
  quantity: z.number(),
  dailyRate: z.number(),
  weeklyRate: z.number(),
  monthlyRate: z.number(),
  discount: z.number(),
  discountType: z.enum(["%", "$"]),
});

const saleLineBase = z.object({
  modelId: z.string(),
  quantity: z.number(),
  unitPrice: z.number(),
  discount: z.number(),
  discountType: z.enum(["%", "$"]),
});

// Estrictos — se usan sólo en superRefine para el bloque activo.
export const rentalLineSchema = rentalLineBase.extend({
  modelId: nonEmptyId,
  quantity: positiveInt,
  dailyRate: nonNegative,
  weeklyRate: nonNegative,
  monthlyRate: nonNegative,
  discount: nonNegative,
}).refine(
  (l) => l.dailyRate > 0 || l.weeklyRate > 0 || l.monthlyRate > 0,
  { message: "Ingresa al menos una tarifa (diaria, semanal o mensual)", path: ["monthlyRate"] },
).refine(
  // R7 Bloque 21.6: descuento porcentual > 100% no es un valor válido de negocio;
  // antes se clampeaba silenciosamente en invoiceTotals.ts (podía enmascarar errores).
  (l) => l.discountType !== "%" || l.discount <= 100,
  { message: "El descuento no puede superar 100%", path: ["discount"] },
);

export const saleLineSchema = saleLineBase.extend({
  modelId: nonEmptyId,
  quantity: positiveInt,
  unitPrice: positive,
  discount: nonNegative,
}).refine(
  (l) => l.discountType !== "%" || l.discount <= 100,
  { message: "El descuento no puede superar 100%", path: ["discount"] },
);

const dateRangeSchema = z.object({
  from: z.date().optional(),
  to: z.date().optional(),
}).partial();

export const quoteFormSchema = z.object({
  quoteType: z.enum(["rental", "sale"]),
  customerId: z.string().trim().min(1, "Selecciona un cliente"),
  customerName: z.string().default(""),
  currency: z.enum(["MXN", "USD"]),
  taxRate: z.string().regex(/^\d+(\.\d+)?$/, "Tasa inválida"),
  notes: z.string().default(""),
  validUntil: z.date().optional(),
  dateRange: dateRangeSchema.optional(),
  rentalLines: z.array(rentalLineBase).default([]),
  saleLines: z.array(saleLineBase).default([]),
  includeLogistics: z.boolean().default(false),
  logisticsCost: nonNegative.default(0),
}).superRefine((val, ctx) => {
  if (val.quoteType === "rental") {
    if (val.rentalLines.length === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["rentalLines"], message: "Agrega al menos una partida" });
    }
    val.rentalLines.forEach((line, i) => {
      const r = rentalLineSchema.safeParse(line);
      if (!r.success) {
        for (const issue of r.error.issues) {
          ctx.addIssue({ ...issue, path: ["rentalLines", i, ...issue.path] });
        }
      }
    });
    if (!val.dateRange?.from || !val.dateRange?.to) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["dateRange"], message: "Selecciona el rango de renta" });
    } else if (val.dateRange.to < val.dateRange.from) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["dateRange"], message: "La fecha final debe ser posterior a la inicial" });
    }
  } else if (val.quoteType === "sale") {
    if (val.saleLines.length === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["saleLines"], message: "Agrega al menos una partida" });
    }
    val.saleLines.forEach((line, i) => {
      const r = saleLineSchema.safeParse(line);
      if (!r.success) {
        for (const issue of r.error.issues) {
          ctx.addIssue({ ...issue, path: ["saleLines", i, ...issue.path] });
        }
      }
    });
  }

  if (val.includeLogistics && val.logisticsCost <= 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["logisticsCost"], message: "Ingresa el costo logístico" });
  }
});

export type QuoteFormValues = z.infer<typeof quoteFormSchema>;
export type RentalLineValues = z.infer<typeof rentalLineSchema>;
export type SaleLineValues = z.infer<typeof saleLineSchema>;
