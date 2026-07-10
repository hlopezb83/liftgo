import { useEntityMutation } from "@/lib/hooks/useEntityMutation";
import { callRpc } from "@/lib/rpc";
import { supplierBillKeys } from "./useSupplierBills";

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
  return useEntityMutation({
    mutationFn: async (input: RegisterPaymentInput) =>
      callRpc<string>("register_supplier_payment", {
        p_bill_id: input.bill_id,
        p_amount: input.amount,
        p_payment_date: input.payment_date,
        p_payment_method: input.payment_method,
        p_bank_account: input.bank_account,
        p_reference: input.reference,
        p_receipt_url: input.receipt_url,
        p_notes: input.notes,
      }),
    invalidateKeysFn: (_id, vars) => [
      supplierBillKeys.all,
      supplierBillKeys.detail(vars.bill_id),
      ["accounts_payable_kpis"],
    ],
    successMsg: "Pago registrado",
    errorTitle: "No se pudo registrar el pago",
  });
}
