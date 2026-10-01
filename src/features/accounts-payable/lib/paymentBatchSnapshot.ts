import { z } from "zod";
import type { PaymentExportRow } from "./buildPaymentsXlsx";

const snapshotItemSchema = z.object({
  supplier_name: z.string(),
  supplier_rfc: z.string().nullable(),
  bank_name: z.string().nullable(),
  clabe: z.string().nullable(),
  account_number: z.string().nullable(),
  account_holder: z.string().nullable(),
  bill_number: z.string(),
  due_date: z.string().nullable(),
  reference: z.string(),
  concept: z.string().nullable(),
  amount: z.coerce.number().finite().positive(),
  currency: z.string().min(1),
});

export const paymentBatchSnapshotSchema = z.object({
  id: z.string(),
  created_at: z.string(),
  cancelled_at: z.string().nullable(),
  payment_count: z.coerce.number().int().nonnegative(),
  items: z.array(snapshotItemSchema).min(1),
});

export type PaymentBatchSnapshot = z.infer<typeof paymentBatchSnapshotSchema>;

/** Reproduce the persisted layout; never look up current supplier/bill data. */
export function paymentBatchExportRows(snapshot: PaymentBatchSnapshot): PaymentExportRow[] {
  if (snapshot.cancelled_at) throw new Error("El lote está cancelado y no se puede descargar para pago.");
  return snapshot.items.map((item) => ({
    ...item,
    bank_name: item.bank_name ?? "",
    clabe: item.clabe ?? "",
    concept: item.concept ?? "",
  }));
}

