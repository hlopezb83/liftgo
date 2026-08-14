import { z } from "zod";
import { positiveAmount } from "@/lib/schemas";
import { nowMty } from "@/lib/utils";

export const supplierPaymentSchema = z
  .object({
    amount: positiveAmount(),
    payment_date: z.date(),
    payment_method: z.string().default("transferencia"),
    bank_account: z.string().default(""),
    reference: z.string().default(""),
    receipt_url: z.string().default(""),
    notes: z.string().default(""),
  })
  .refine(
    (d) => {
      // F7 (Sprint M1): la fecha de pago no puede ser futura — mismo criterio
      // que los pagos de clientes (useRecordPaymentForm, R10 Bloque 8.1).
      const endOfToday = nowMty();
      endOfToday.setHours(23, 59, 59, 999);
      return d.payment_date.getTime() <= endOfToday.getTime();
    },
    { message: "La fecha del pago no puede ser futura.", path: ["payment_date"] },
  );

export type SupplierPaymentFormData = z.infer<typeof supplierPaymentSchema>;
