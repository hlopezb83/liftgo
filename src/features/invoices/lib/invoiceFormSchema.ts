import { z } from "zod";
import { nowMty } from "@/lib/utils";

export const lineItemSchema = z.object({
  description: z.string().trim().min(1, "Descripción requerida"),
  quantity: z.number().min(1, "Cantidad ≥ 1"),
  unit_price: z.number().min(0, "Precio ≥ 0"),
  total: z.number(),
  clave_prod_serv: z.string().optional(),
  clave_unidad: z.string().optional(),
  objeto_imp: z.string().optional(),
  discount: z.number().optional(),
  discount_type: z.enum(["%", "$"]).optional(),
});


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
});

export const invoiceFormSchema = z.object({
  bookingId: z.string(),
  customerId: z.string().nullable(),
  customerName: z.string(),
  lineItems: z.array(lineItemSchema).min(1, "Agrega al menos una partida"),
  taxRate: z.number().min(0),
  issueDate: z.date(),
  dueDate: z.date().optional(),
  notes: z.string(),
  cfdi: cfdiSchema,
});

export type LineItemValues = z.infer<typeof lineItemSchema>;
export type CfdiFormValues = z.infer<typeof cfdiSchema>;
export type InvoiceFormValues = z.infer<typeof invoiceFormSchema>;

export const EMPTY_CFDI: CfdiFormValues = {
  serie: "", folio: "", formaPago: "03", metodoPago: "PUE", usoCfdi: "G03",
  moneda: "MXN", tipoCambio: 1,
  receptorRfc: "", receptorRazonSocial: "", receptorRegimenFiscal: "", receptorDomicilioFiscalCp: "",
};

export const EMPTY_LINE: LineItemValues = {
  description: "", quantity: 1, unit_price: 0, total: 0,
  clave_prod_serv: "78181500", clave_unidad: "DAY", objeto_imp: "02",
};

export const buildEmptyInvoiceValues = (): InvoiceFormValues => ({
  bookingId: "",
  customerId: null,
  customerName: "",
  lineItems: [],
  taxRate: 16,
  issueDate: nowMty(),
  dueDate: undefined,
  notes: "",
  cfdi: { ...EMPTY_CFDI },
});
