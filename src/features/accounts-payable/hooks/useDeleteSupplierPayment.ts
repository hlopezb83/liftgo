import { useMutation, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { notifyError, notifySuccess } from "@/lib/ui/appFeedback";
import { SUPPLIER_BILLS_QK } from "./useSupplierBills";

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
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ paymentId }: DeleteSupplierPaymentInput) => {
      const { error } = await supabase
        .from("supplier_payments")
        .delete()
        .eq("id", paymentId);
      if (error) throw error;
      return paymentId;
    },
    onSuccess: (paymentId, vars) => {
      qc.invalidateQueries({ queryKey: SUPPLIER_BILLS_QK });
      qc.invalidateQueries({ queryKey: supplierBillKeys.detail(vars.billId) });
      qc.invalidateQueries({ queryKey: ["accounts_payable_kpis"] });
      qc.invalidateQueries({ queryKey: ["reconciliation_status", `supplier:${paymentId}`] });
      qc.invalidateQueries({ queryKey: ["bank_statement_lines"] });
      notifySuccess("Pago eliminado");
    },
    onError: (e: unknown) =>
      notifyError({ error: e, message: "No se pudo eliminar el pago" }),
  });
}
