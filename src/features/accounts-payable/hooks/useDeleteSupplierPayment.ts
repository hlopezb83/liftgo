import { reconciliationStatusKey } from "@/features/bank-reconciliation";
import { bankLineKeys } from "@/features/bank-reconciliation";
import { supabase } from "@/integrations/supabase/client";
import { useEntityMutation } from "@/lib/hooks/useEntityMutation";
import { supplierBillKeys } from "./useSupplierBills";

interface DeleteSupplierPaymentInput {
  paymentId: string;
  billId: string;
}

/**
 * Elimina físicamente un pago de proveedor. El trigger
 * `trg_sp_recalc_aiud` recalcula automáticamente el saldo y estado de
 * la factura, y el FK `matched_supplier_payment_id` (ON DELETE SET NULL)
 * desvincula cualquier línea bancaria conciliada.
 */
export function useDeleteSupplierPayment() {
  return useEntityMutation({
    mutationFn: async ({ paymentId }: DeleteSupplierPaymentInput) => {
      const { error } = await supabase
        .from("supplier_payments")
        .delete()
        .eq("id", paymentId);
      if (error) throw error;
      return paymentId;
    },
    invalidateKeysFn: (paymentId, vars) => [
      supplierBillKeys.all,
      supplierBillKeys.detail(vars.billId),
      ["accounts_payable_kpis"],
      reconciliationStatusKey({ supplierPaymentId: paymentId }),
      bankLineKeys.all,
    ],
    successMsg: "Pago eliminado",
    errorTitle: "No se pudo eliminar el pago",
  });
}
