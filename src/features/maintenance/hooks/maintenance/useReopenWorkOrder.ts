import { useEntityMutation } from "@/lib/hooks/useEntityMutation";
import { callRpc } from "@/lib/rpc";
import { maintenanceInvalidationKeys } from "../../lib/maintenanceInvalidationKeys";

export interface ReopenWorkOrderInput {
  id: string;
  reason: string;
}

/**
 * Reabre una OT cerrada por error. La RPC `reopen_work_order` es la única vía
 * permitida: el trigger `guard_maintenance_reopen` bloquea cualquier UPDATE
 * directo de `work_status` sobre una orden cerrada. La RPC valida rol admin,
 * exige motivo y deja bitácora en `status_logs`.
 */
export function useReopenWorkOrder() {
  return useEntityMutation({
    mutationFn: async ({ id, reason }: ReopenWorkOrderInput) => {
      await callRpc<void>("reopen_work_order", { p_log_id: id, p_reason: reason });
      return id;
    },
    invalidateKeys: maintenanceInvalidationKeys,
    successMsg: "Orden de trabajo reabierta",
    errorTitle: "No se pudo reabrir la orden de trabajo",
  });
}
