import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEntityMutation } from "@/lib/hooks/useEntityMutation";
import { maintenanceLogKeys } from "../../lib/queryKeys";

/** Estados de daño que aún bloquean el cierre "limpio" de la OT. */
const OPEN_DAMAGE_STATUSES = ["reported", "in_repair"] as const;

export interface LinkedOpenDamage {
  id: string;
  description: string;
  status: string;
}

/**
 * Daño asociado a la OT que sigue abierto. Se usa para avisar al usuario
 * ANTES de confirmar el cierre, en vez de dejar que el guard de la base de
 * datos devuelva el error después de enviar.
 */
export function useOpenDamageForLog(maintenanceLogId: string | null | undefined) {
  return useQuery({
    queryKey: ["damage_records", "byMaintenanceLog", maintenanceLogId],
    enabled: Boolean(maintenanceLogId),
    staleTime: 30_000,
    queryFn: async (): Promise<LinkedOpenDamage | null> => {
      const { data, error } = await supabase
        .from("damage_records")
        .select("id, description, status")
        .eq("maintenance_log_id", maintenanceLogId as string)
        .is("deleted_at", null)
        .in("status", [...OPEN_DAMAGE_STATUSES])
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data ?? null;
    },
  });
}

export interface CloseWorkOrderInput {
  id: string;
  performedAt: string;
  description: string | null;
}

/** Cierra la OT: marca `completed` y sella la fecha/notas de cierre. */
export function useCloseWorkOrder() {
  return useEntityMutation({
    mutationFn: async ({ id, performedAt, description }: CloseWorkOrderInput) => {
      const patch: TablesUpdate<"maintenance_logs"> = {
        work_status: "completed",
        performed_at: performedAt,
        ...(description !== null ? { description } : {}),
      };
      const { data, error } = await supabase
        .from("maintenance_logs")
        .update(patch)

        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    invalidateKeys: [maintenanceLogKeys.all],
    successMsg: "Orden de trabajo cerrada",
    errorTitle: "No se pudo cerrar la orden de trabajo",
  });
}
