import { useMutation, useQueryClient } from "@tanstack/react-query";

import { callRpc } from "@/lib/rpc";
import { notifyError, notifySuccess } from "@/lib/ui/appFeedback";
import { SUPPLIER_BILLS_QK } from "./useSupplierBills";
import { EXPORTABLE_PAYABLES_QK } from "./useExportablePayables";
import { PAYMENT_BATCHES_QK } from "./usePaymentBatches";

export interface PaymentBatchItemInput {
  bill_id: string;
  amount: number;
  reference?: string;
}

export function useCreatePaymentBatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { items: PaymentBatchItemInput[]; notes?: string }) => {
      return callRpc<string>("create_supplier_payment_batch", {
        p_items: input.items,
        p_notes: input.notes ?? null,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: SUPPLIER_BILLS_QK });
      qc.invalidateQueries({ queryKey: EXPORTABLE_PAYABLES_QK });
      qc.invalidateQueries({ queryKey: PAYMENT_BATCHES_QK });
      qc.invalidateQueries({ queryKey: ["accounts_payable_kpis"] });
      notifySuccess("Lote de pagos creado");
    },
    onError: (e: unknown) =>
      notifyError({ error: e, message: "No se pudo crear el lote de pagos" }),
  });
}
