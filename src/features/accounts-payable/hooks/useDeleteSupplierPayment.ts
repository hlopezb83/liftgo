import { reconciliationStatusKey } from "@/features/bank-reconciliation";
import { bankLineKeys } from "@/features/bank-reconciliation";
import { supabase } from "@/integrations/supabase/client";
import { useEntityMutation } from "@/lib/hooks/useEntityMutation";
import type { BusinessBlock } from "@/lib/rules/businessBlocks";
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
 *
 * La autoridad es la base de datos: `trg_guard_supplier_payment_delete`
 * rechaza el borrado si el REP fiscal ya fue recibido, si la factura de
 * proveedor está cancelada o si quien borra no es administrador. Cuando eso
 * ocurre (estado obsoleto en pantalla o carrera), el rechazo se entrega como
 * bloqueo explicable en vez de un toast técnico.
 */
export function useDeleteSupplierPayment(opts?: { onBusinessBlock?: (block: BusinessBlock) => void }) {
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
    onBusinessBlock: opts?.onBusinessBlock ? (block) => opts.onBusinessBlock?.(block) : undefined,
  });
}
