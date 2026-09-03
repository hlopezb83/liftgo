import { z } from "zod";
import { nowMty } from "@/lib/utils";

export const lineItemSchema = z
  .object({
    description: z.string().trim().min(1, "Descripción requerida"),
    quantity: z.number().min(1, "Cantidad ≥ 1"),
    unit_price: z.number().min(0, "Precio ≥ 0"),
    total: z.number(),
    clave_prod_serv: z.string().optional(),
    clave_unidad: z.string().optional(),
    objeto_imp: z.string().optional(),
    /** Tasa de IVA en porcentaje para esta línea; si falta se usa la tasa global. */
    tax_rate: z.number().min(0).optional(),
    // El tope de 100 solo aplica a descuentos porcentuales ('%'); un descuento
    // fijo ('$') puede ser mayor al total de la línea (la capa de dominio lo
    // clampea a 0). Antes .max(100) bloqueaba descuentos fijos válidos heredados
    // de cotizaciones, impidiendo convertir una cotización con descuento $>100.
    discount: z
      .number()
      .min(0, "El descuento no puede ser negativo")
      .optional(),

    discount_type: z.enum(["%", "$"]).optional(),
  })
  .refine(
    (l) => l.discount_type !== "%" || l.discount == null || l.discount <= 100,
    { message: "El descuento no puede exceder 100%", path: ["discount"] },
  );


export const cfdiSchema = z.object({
  serie: z.string(),
  folio: z.string(),
  formaPago: z.string(),
  metodoPago: z.string(),
  usoCfdi: z.string(),
  moneda: z.string(),
  tipoCambio: z.number().min(0),
  receptorRfc: z.string(),
  receptorRazonSocial: z.string(),
  receptorRegimenFiscal: z.string(),
  receptorDomicilioFiscalCp: z.string(),
  globalPeriodicity: z.string().default(""),
  globalMonths: z.string().default(""),
  globalYear: z.number().int().optional(),
});

export const invoiceFormSchema = z
  .object({
    bookingId: z.string(),
    bookingIds: z.array(z.string()).default([]),
    customerId: z.string().min(1, "El cliente es requerido"),
    customerName: z.string(),
    lineItems: z.array(lineItemSchema).min(1, "Agrega al menos una partida"),
    taxRate: z.number().min(0),
    issueDate: z.date(),
    dueDate: z.date().optional(),
    /** H-6: periodo de facturación obligatorio cuando la factura tiene reserva. */
    billingPeriodStart: z.string().default(""),
    billingPeriodEnd: z.string().default(""),
    notes: z.string(),
    cfdi: cfdiSchema,
  })
  .superRefine((values, ctx) => {
    // H-6: una factura vinculada a reserva debe llevar periodo de facturación.
    const hasBooking = values.bookingIds.length > 0 || values.bookingId.trim() !== "";
    if (hasBooking && !values.billingPeriodStart) {
      ctx.addIssue({
        code: "custom",
        path: ["billingPeriodStart"],
        message: "El periodo de facturación es requerido para facturas con reserva",
      });
    }
    // Regresión v7.423.0 (P3): el fin del periodo también es obligatorio —
    // sin él, un fallback silencioso completaba un fin de mes ajeno a la
    // reserva. El servidor (sync_invoice_bookings) impone la misma regla.
    if (hasBooking && !values.billingPeriodEnd) {
      ctx.addIssue({
        code: "custom",
        path: ["billingPeriodEnd"],
        message: "El fin del periodo es requerido para facturas con reserva",
      });
    }
    // start <= end (comparación lexicográfica, segura en YYYY-MM-DD).
    if (
      values.billingPeriodStart &&
      values.billingPeriodEnd &&
      values.billingPeriodStart > values.billingPeriodEnd
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["billingPeriodEnd"],
        message: "El fin del periodo no puede ser anterior al inicio",
      });
    }

    const rfc = (values.cfdi.receptorRfc || "").toUpperCase();
    if (rfc === "XAXX010101000") {
      if (!values.cfdi.globalPeriodicity) {
        ctx.addIssue({ code: "custom", path: ["cfdi", "globalPeriodicity"], message: "Requerido para Público en General" });
      }
      if (!values.cfdi.globalMonths) {
        ctx.addIssue({ code: "custom", path: ["cfdi", "globalMonths"], message: "Requerido para Público en General" });
      }
      if (!values.cfdi.globalYear) {
        ctx.addIssue({ code: "custom", path: ["cfdi", "globalYear"], message: "Requerido para Público en General" });
      }
    }
    // B-11: tipoCambio admite 0 en el schema base, pero para moneda foránea
    // un tipo de cambio 0 es inválido (colapsaría la conversión a MXN).
    // FIX-6: un TC exactamente 1 en moneda foránea es el patrón "sin capturar"
    // que la BD trata como faltante (`fx_is_missing`) y distorsiona los KPIs.
    if (values.cfdi.moneda !== "MXN" && !(values.cfdi.tipoCambio > 0)) {
      ctx.addIssue({
        code: "custom",
        path: ["cfdi", "tipoCambio"],
        message: "El tipo de cambio debe ser mayor a 0 para moneda distinta de MXN",
      });
    } else if (values.cfdi.moneda !== "MXN" && values.cfdi.tipoCambio === 1) {
      ctx.addIssue({
        code: "custom",
        path: ["cfdi", "tipoCambio"],
        message: "Captura el tipo de cambio real: 1.00 no es válido para moneda distinta de MXN",
      });
    }

    // M2: una factura con todas las partidas en $0 no debe poder crearse.
    const invoiceTotal = values.lineItems.reduce(
      (sum, l) => sum + (l.quantity || 0) * (l.unit_price || 0),
      0,
    );
    if (invoiceTotal <= 0) {
      ctx.addIssue({
        code: "custom",
        path: ["lineItems"],
        message: "El total de la factura debe ser mayor a $0",
      });
    }
  });

export type LineItemValues = z.infer<typeof lineItemSchema>;
export type CfdiFormValues = z.infer<typeof cfdiSchema>;
export type InvoiceFormValues = z.infer<typeof invoiceFormSchema>;

export const EMPTY_CFDI: CfdiFormValues = {
  serie: "", folio: "", formaPago: "03", metodoPago: "PUE", usoCfdi: "G03",
  moneda: "MXN", tipoCambio: 1,
  receptorRfc: "", receptorRazonSocial: "", receptorRegimenFiscal: "", receptorDomicilioFiscalCp: "",
  globalPeriodicity: "", globalMonths: "", globalYear: undefined,
};

export const EMPTY_LINE: LineItemValues = {
  description: "", quantity: 1, unit_price: 0, total: 0,
  clave_prod_serv: "78181500", clave_unidad: "DAY", objeto_imp: "02",
};

export const buildEmptyInvoiceValues = (): InvoiceFormValues => ({
  bookingId: "",
  bookingIds: [],
  customerId: "",
  customerName: "",
  lineItems: [],
  taxRate: 16,
  issueDate: nowMty(),
  dueDate: undefined,
  billingPeriodStart: "",
  billingPeriodEnd: "",
  notes: "",
  cfdi: { ...EMPTY_CFDI },
});
