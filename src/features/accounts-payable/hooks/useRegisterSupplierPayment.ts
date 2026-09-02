import { cashFlowProjectionQueries } from "@/features/cash-flow";
import { useEntityMutation } from "@/lib/hooks/useEntityMutation";
import { callRpc } from "@/lib/rpc";
import { exportablePayableQueries } from "./useExportablePayables";
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
  /**
   * FIX-2 (ronda 3): liga EXPLÍCITA con un lote de pago. Sólo lo envía el
   * flujo de pago desde el lote; un abono manual va sin lote para no bloquear
   * la cancelación del lote.
   */
  batchId?: string | null;
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
        p_batch_id: input.batchId ?? null,
      }),
    // R-M3: incluir la proyección de flujo de caja para que "POR PAGAR" baje
    // de inmediato tras registrar un pago (antes requería F5).
    invalidateKeysFn: (_id, vars) => [
      supplierBillKeys.all,
      supplierBillKeys.detail(vars.bill_id),
      exportablePayableQueries.keys.all,
      cashFlowProjectionQueries.keys.all,
      ["accounts_payable_kpis"],
      ["dashboard-financial-kpis"],
      ["cash-flow"],
    ],
    successMsg: "Pago registrado",
    errorTitle: "No se pudo registrar el pago",
  });
}
