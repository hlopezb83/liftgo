import { useEntityMutation } from "@/lib/hooks/useEntityMutation";
import { callRpc } from "@/lib/rpc";
import { exportablePayableQueries } from "./useExportablePayables";
import { PAYMENT_BATCHES_QK } from "./usePaymentBatches";
import { supplierBillKeys } from "./useSupplierBills";

/**
 * A2-3: cancela un lote de pagos a proveedores y libera las facturas que
 * quedaron reservadas en él. El caso real que cubre es el lote "huérfano":
 * `create_supplier_payment_batch` ya reservó las facturas pero la generación
 * del Excel falló, así que el usuario no tiene el layout bancario y las
 * facturas quedarían bloqueadas para futuras exportaciones.
 *
 * Las reglas de qué lotes son cancelables (estado, rol, pagos ya aplicados)
 * viven en el RPC `cancel_supplier_payment_batch`; aquí no se duplican.
 */
export function useCancelPaymentBatch() {
  return useEntityMutation({
    mutationFn: async (batchId: string) =>
      callRpc<undefined>("cancel_supplier_payment_batch", { p_batch_id: batchId }),
    invalidateKeys: [
      supplierBillKeys.all,
      exportablePayableQueries.keys.all,
      PAYMENT_BATCHES_QK,
      ["accounts_payable_kpis"],
    ],
    errorTitle: "No se pudo cancelar el lote de pagos",
  });
}
