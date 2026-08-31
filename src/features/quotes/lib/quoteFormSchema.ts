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
  // A5-02: el tipo de cambio se captura en la cotización y se propaga a la
  // reserva y a la factura. Antes nunca se almacenaba y `quotes.tipo_cambio`
  // quedaba en su DEFAULT 1 (paridad ficticia USD 1:1).
  tipoCambio: nonNegative.default(1),

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
    refineRentalLines(val.rentalLines, ctx);
    refineDateRange(val.dateRange, ctx);
  } else if (val.quoteType === "sale") {
    refineSaleLines(val.saleLines, ctx);
  }

  if (val.includeLogistics && val.logisticsCost <= 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["logisticsCost"], message: "Ingresa el costo logístico" });
  }

  if (val.includeInsurance && val.insuranceCost <= 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["insuranceCost"], message: "Ingresa el costo del seguro" });
  }

  // A5-02: moneda foránea exige tipo de cambio > 0 (mismo criterio que
  // `invoiceFormSchema`); un TC 0/1 falsearía la conversión a MXN.
  if (val.currency !== "MXN" && !(val.tipoCambio > 0)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["tipoCambio"],
      message: "El tipo de cambio debe ser mayor a 0 para moneda distinta de MXN",
    });
  }

  checkValidUntil(val.validUntil, val.dateRange?.from, ctx);
});

/** Copia las incidencias de una partida al path indexado del arreglo. */
function pushLineIssues(
  result: { success: true } | { success: false; error: { issues: z.ZodIssue[] } },
  key: "rentalLines" | "saleLines",
  index: number,
  ctx: z.RefinementCtx,
): void {

  if (result.success) return;
  for (const issue of result.error.issues) {
    ctx.addIssue({ ...issue, path: [key, index, ...issue.path] });
  }
}

/**
 * R14-FE-01: "Agregar modelo" deja una fila-draft prístina que invalidaba
 * el submit sin feedback global. Se ignoran (tampoco llegan al payload).
 */
function isPristineRental(l: z.infer<typeof rentalLineBase>): boolean {
  return l.modelId === "" && !l.legacyTotal &&
    l.dailyRate === 0 && l.weeklyRate === 0 && l.monthlyRate === 0;
}

function refineRentalLines(lines: z.infer<typeof rentalLineBase>[], ctx: z.RefinementCtx): void {
  if (lines.filter((l) => !isPristineRental(l)).length === 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["rentalLines"], message: "Agrega al menos una partida" });
  }
  lines.forEach((line, i) => {
    if (isPristineRental(line)) return;
    pushLineIssues(rentalLineSchema.safeParse(line), "rentalLines", i, ctx);
  });
}

function refineSaleLines(lines: z.infer<typeof saleLineBase>[], ctx: z.RefinementCtx): void {
  const isPristine = (l: z.infer<typeof saleLineBase>) => l.modelId === "" && l.unitPrice === 0;
  if (lines.filter((l) => !isPristine(l)).length === 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["saleLines"], message: "Agrega al menos una partida" });
  }
  lines.forEach((line, i) => {
    if (isPristine(line)) return;
    pushLineIssues(saleLineSchema.safeParse(line), "saleLines", i, ctx);
  });
}

function refineDateRange(range: { from?: Date; to?: Date } | undefined, ctx: z.RefinementCtx): void {
  if (!range?.from || !range?.to) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["dateRange"], message: "Selecciona el rango de renta" });
  } else if (range.to < range.from) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["dateRange"], message: "La fecha final debe ser posterior a la inicial" });
  }
}



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
