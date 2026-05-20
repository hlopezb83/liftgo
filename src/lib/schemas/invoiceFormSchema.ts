import { z } from "zod";
import { nowMty } from "@/lib/utils";

export const lineItemSchema = z.object({
  description: z.string().default(""),
  quantity: z.number().min(1, "Cantidad ≥ 1"),
  unit_price: z.number().min(0, "Precio ≥ 0"),
  total: z.number().default(0),
  clave_prod_serv: z.string().optional(),
  clave_unidad: z.string().optional(),
  objeto_imp: z.string().optional(),
  discount: z.number().optional(),
  discount_type: z.enum(["%", "$"]).optional(),
});

export const cfdiSchema = z.object({
  serie: z.string().default(""),
  folio: z.string().default(""),
  formaPago: z.string().default("03"),
  metodoPago: z.string().default("PUE"),
  usoCfdi: z.string().default("G03"),
  moneda: z.string().default("MXN"),
  tipoCambio: z.number().min(0).default(1),
  receptorRfc: z.string().default(""),
  receptorRazonSocial: z.string().default(""),
  receptorRegimenFiscal: z.string().default(""),
  receptorDomicilioFiscalCp: z.string().default(""),
});

export const invoiceFormSchema = z.object({
  bookingId: z.string().default(""),
  customerId: z.string().nullable().default(null),
  customerName: z.string().default(""),
  lineItems: z.array(lineItemSchema).min(1, "Agrega al menos una partida"),
  taxRate: z.number().min(0).default(16),
  issueDate: z.date(),
  dueDate: z.date().optional(),
  notes: z.string().default(""),
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
