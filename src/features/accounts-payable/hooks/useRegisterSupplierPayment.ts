import { useMutation, useQueryClient } from "@tanstack/react-query";

import { notifyError, notifySuccess } from "@/lib/ui/appFeedback";
import { callRpc } from "@/lib/rpc";
import { SUPPLIER_BILLS_QK } from "./useSupplierBills";

export interface RegisterPaymentInput {
  bill_id: string;
  amount: number;
  payment_date: string;
  payment_method?: string;
  bank_account?: string;
  reference?: string;
  receipt_url?: string;
  notes?: string;
}

export function useRegisterSupplierPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: RegisterPaymentInput) => {
      return callRpc<string>("register_supplier_payment", {
        p_bill_id: input.bill_id,
        p_amount: input.amount,
        p_payment_date: input.payment_date,
        p_payment_method: input.payment_method,
        p_bank_account: input.bank_account,
        p_reference: input.reference,
        p_receipt_url: input.receipt_url,
        p_notes: input.notes,
      });
    },
    onSuccess: (_id, variables) => {
      qc.invalidateQueries({ queryKey: SUPPLIER_BILLS_QK });
      qc.invalidateQueries({ queryKey: supplierBillKeys.detail(variables.bill_id) });
      qc.invalidateQueries({ queryKey: ["accounts_payable_kpis"] });
      notifySuccess("Pago registrado");
    },
    onError: (e: unknown) =>
      notifyError({ error: e, message: "No se pudo registrar el pago" }),
  });
}
