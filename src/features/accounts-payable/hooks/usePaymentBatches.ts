import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { callRpc } from "@/lib/rpc";

export const PAYMENT_BATCHES_QK = ["supplier_payment_batches"] as const;
export const PAYMENT_BATCH_PAGE_SIZE = 20;

const batchSummarySchema = z.object({
  id: z.string(),
  created_at: z.string(),
  bill_count: z.coerce.number().int().nonnegative(),
  notes: z.string().nullable(),
  cancelled_at: z.string().nullable(),
  payment_count: z.coerce.number().int().nonnegative(),
  totals_by_currency: z.array(z.object({
    currency: z.string(),
    total: z.coerce.number().finite().nonnegative(),
  })),
});
const pageSchema = z.object({
  items: z.array(batchSummarySchema),
  total_count: z.coerce.number().int().nonnegative(),
});
export type PaymentBatchSummary = z.infer<typeof batchSummarySchema>;

export function usePaymentBatches(open: boolean, page: number) {
  return useQuery({
    queryKey: [...PAYMENT_BATCHES_QK, "page", page] as const,
    enabled: open,
    staleTime: 0,
    queryFn: async () => pageSchema.parse(await callRpc<unknown>("get_supplier_payment_batches_page", {
      p_page_size: PAYMENT_BATCH_PAGE_SIZE,
      p_offset: Math.max(0, page) * PAYMENT_BATCH_PAGE_SIZE,
    })),
  });
}
