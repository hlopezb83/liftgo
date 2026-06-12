import { z } from "zod";

export const supplierPaymentSchema = z.object({
  amount: z.coerce.number().positive("El monto debe ser mayor a 0"),
  payment_date: z.date(),
  payment_method: z.string().default("transferencia"),
  bank_account: z.string().default(""),
  reference: z.string().default(""),
  receipt_url: z.string().default(""),
  notes: z.string().default(""),
});

export type SupplierPaymentFormData = z.infer<typeof supplierPaymentSchema>;
