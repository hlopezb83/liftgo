import { z } from "zod";
import { nowMty } from "@/lib/utils";

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
  // R13-FE-01 (P1): las cotizaciones legacy sin `rental_meta` guardan un
  // precio plano acordado. Se conserva aquí para no recalcularlo mientras la
  // partida no tenga modelo seleccionado.
  legacyTotal: z.number().optional(),
  legacyDescription: z.string().optional(),
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
  // R13-FE-01: una partida legacy válida puede no tener modelo todavía.
  modelId: z.string(),
  quantity: positiveInt,
  dailyRate: nonNegative,
  weeklyRate: nonNegative,
  monthlyRate: nonNegative,
  discount: nonNegative,
}).refine(
  (l) => (l.legacyTotal ?? 0) > 0 || (l.modelId !== "" && (l.dailyRate > 0 || l.weeklyRate > 0 || l.monthlyRate > 0)),
  { message: "Selecciona un modelo e ingresa al menos una tarifa", path: ["monthlyRate"] },
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
  includeInsurance: z.boolean().default(false),
  insuranceCost: nonNegative.default(0),
}).superRefine((val, ctx) => {
  if (val.quoteType === "rental") {
    // R14-FE-01: "Agregar modelo" deja una fila-draft prístina que invalidaba
    // el submit sin feedback global. Se ignoran (tampoco llegan al payload).
    const isPristine = (l: (typeof val.rentalLines)[number]) =>
      l.modelId === "" && !l.legacyTotal &&
      l.dailyRate === 0 && l.weeklyRate === 0 && l.monthlyRate === 0;
    const lines = val.rentalLines.filter((l) => !isPristine(l));
    if (lines.length === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["rentalLines"], message: "Agrega al menos una partida" });
    }
    val.rentalLines.forEach((line, i) => {
      if (isPristine(line)) return;
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
    const isPristineSale = (l: (typeof val.saleLines)[number]) =>
      l.modelId === "" && l.unitPrice === 0;
    const lines = val.saleLines.filter((l) => !isPristineSale(l));
    if (lines.length === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["saleLines"], message: "Agrega al menos una partida" });
    }
    val.saleLines.forEach((line, i) => {
      if (isPristineSale(line)) return;
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

  if (val.includeInsurance && val.insuranceCost <= 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["insuranceCost"], message: "Ingresa el costo del seguro" });
  }

  checkValidUntil(val.validUntil, val.dateRange?.from, ctx);
});

const atMidnight = (d: Date): number => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
};

/**
 * R10 Bloque 11.2: `validUntil` no puede quedar en el pasado (día calendario
 * de Monterrey, para no rechazar "hoy").
 * R12-FE-07 (P2 r11): tampoco antes del inicio del periodo de renta.
 */
function checkValidUntil(validUntil: Date | null | undefined, from: Date | undefined, ctx: z.RefinementCtx): void {
  if (!validUntil) return;
  const vu = atMidnight(validUntil);
  const issue = (message: string) =>
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["validUntil"], message });
  if (vu < atMidnight(nowMty())) {
    issue("La fecha de vigencia no puede estar en el pasado");
    return;
  }
  if (from && vu < atMidnight(from)) {
    issue("La vigencia no puede ser anterior al periodo de renta");
  }
}

export type QuoteFormValues = z.infer<typeof quoteFormSchema>;
export type RentalLineValues = z.infer<typeof rentalLineSchema>;
export type SaleLineValues = z.infer<typeof saleLineSchema>;
