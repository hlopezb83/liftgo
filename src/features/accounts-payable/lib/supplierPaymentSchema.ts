import { z } from "zod";
import { positiveAmount } from "@/lib/schemas";

export const supplierPaymentSchema = z.object({
  amount: positiveAmount(),
  payment_date: z.date(),
  payment_method: z.string().default("transferencia"),
  bank_account: z.string().default(""),
  reference: z.string().default(""),
  receipt_url: z.string().default(""),
  notes: z.string().default(""),
});

export type SupplierPaymentFormData = z.infer<typeof supplierPaymentSchema>;
