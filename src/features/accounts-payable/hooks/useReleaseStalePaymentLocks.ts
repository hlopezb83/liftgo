import { useQuery } from "@tanstack/react-query";
import { useEntityMutation } from "@/lib/hooks/useEntityMutation";
import { callRpc } from "@/lib/rpc";
import { notifySuccess } from "@/lib/ui/appFeedback";
import { exportablePayableQueries } from "./useExportablePayables";
import { PAYMENT_BATCHES_QK } from "./usePaymentBatches";
import { supplierBillKeys } from "./useSupplierBills";

/** Antigüedad mínima (horas) que debe tener un bloqueo para considerarse estancado. */
export const STALE_LOCK_HOURS = 24;

export const RELEASABLE_LOCKS_QK = ["releasable_payment_locks", STALE_LOCK_HOURS] as const;

/**
 * R7-12: conteo real de bloqueos liberables según el RPC (mismas precondiciones
 * que el barrido). Antes la UI se guiaba solo por `payment_in_progress_at` de la
 * página visible, así que el botón aparecía aunque no hubiera nada que liberar
 * (clic no-op) y se ocultaba si el lock vivía en una página no cargada.
 */
export function useReleasablePaymentLocksCount() {
  return useQuery({
    queryKey: RELEASABLE_LOCKS_QK,
    queryFn: () =>
      callRpc<number>("count_releasable_payment_locks", {
        p_older_than_hours: STALE_LOCK_HOURS,
      }),
    staleTime: 60_000,
  });
}

/**
 * R6 A2-3 (red de seguridad): libera facturas que quedaron marcadas como
 * "pago en proceso" por un lote abandonado o inexistente y que no tienen pagos
 * registrados.
 *
 * Las reglas (antigüedad mínima, rol, ausencia de pagos) viven en el RPC
 * `release_stale_payment_locks`; aquí no se duplican.
 */
export function useReleaseStalePaymentLocks() {
  return useEntityMutation({
    mutationFn: async (olderThanHours = STALE_LOCK_HOURS) =>
      callRpc<number>("release_stale_payment_locks", {
        p_older_than_hours: olderThanHours,
      }),
    invalidateKeys: [
      supplierBillKeys.all,
      exportablePayableQueries.keys.all,
      PAYMENT_BATCHES_QK,
      RELEASABLE_LOCKS_QK,
      ["accounts_payable_kpis"],
    ],
    errorTitle: "No se pudieron liberar los bloqueos de pago",
    // R7-12: el conteo devuelto se descartaba; sin feedback el clic parecía no-op.
    onSuccess: (released) => {
      const n = Number(released ?? 0);
      notifySuccess(
        n === 0
          ? "No había bloqueos de pago liberables"
          : `Se ${n === 1 ? "liberó" : "liberaron"} ${n} factura${n === 1 ? "" : "s"}`,
      );
    },
  });
}
