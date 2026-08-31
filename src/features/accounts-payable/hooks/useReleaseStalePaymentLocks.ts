import { useEntityMutation } from "@/lib/hooks/useEntityMutation";
import { callRpc } from "@/lib/rpc";
import { exportablePayableQueries } from "./useExportablePayables";
import { PAYMENT_BATCHES_QK } from "./usePaymentBatches";
import { supplierBillKeys } from "./useSupplierBills";

/**
 * R6 A2-3 (red de seguridad): libera facturas que quedaron marcadas como
 * "pago en proceso" por un lote que ya no existe (wizard abandonado, error de
 * red al generar el layout) y que no tienen pagos registrados.
 *
 * Las reglas (antigüedad mínima, rol, ausencia de lote/pagos) viven en el RPC
 * `release_stale_payment_locks`; aquí no se duplican.
 */
export function useReleaseStalePaymentLocks() {
  return useEntityMutation({
    mutationFn: async (olderThanHours = 24) =>
      callRpc<number>("release_stale_payment_locks", {
        p_older_than_hours: olderThanHours,
      }),
    invalidateKeys: [
      supplierBillKeys.all,
      exportablePayableQueries.keys.all,
      PAYMENT_BATCHES_QK,
      ["accounts_payable_kpis"],
    ],
    errorTitle: "No se pudieron liberar los bloqueos de pago",
  });
}
