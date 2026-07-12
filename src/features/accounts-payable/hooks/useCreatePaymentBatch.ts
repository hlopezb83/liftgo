import { useEntityMutation } from "@/lib/hooks/useEntityMutation";
import { callRpc } from "@/lib/rpc";
import { exportablePayableQueries } from "./useExportablePayables";
import { PAYMENT_BATCHES_QK } from "./usePaymentBatches";
import { supplierBillKeys } from "./useSupplierBills";

export interface PaymentBatchItemInput {
  bill_id: string;
  amount: number;
  reference?: string;
}

export function useCreatePaymentBatch() {
  return useEntityMutation({
    mutationFn: async (input: { items: PaymentBatchItemInput[]; notes?: string }) =>
      callRpc<string>("create_supplier_payment_batch", {
        p_items: input.items,
        p_notes: input.notes ?? null,
      }),
    invalidateKeys: [
      supplierBillKeys.all,
      exportablePayableQueries.keys.all,
      PAYMENT_BATCHES_QK,
      ["accounts_payable_kpis"],
    ],
    successMsg: "Lote de pagos creado",
    errorTitle: "No se pudo crear el lote de pagos",
  });
}
