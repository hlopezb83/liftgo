import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useEntityMutation } from "@/lib/hooks/useEntityMutation";
import type { DamageRecordWithJoins } from "@/types/rental";
import { damageInvalidationKeys } from "../lib/damageInvalidationKeys";

function isMissingRpcError(error: { code?: string; message?: string }): boolean {
  return (
    error.code === "PGRST202" ||
    error.code === "42883" ||
    /schema cache|could not find the function/i.test(error.message ?? "")
  );
}

/**
 * GUI-FE-06d (G-MEC-03): mutación atómica para iniciar orden de reparación de daño.
 * Intenta el RPC `start_repair_work_order` y, si aún no existe en el entorno,
 * ejecuta secuencialmente el alta de `maintenance_logs` + actualización de
 * `damage_records` (con compensación `soft_delete_maintenance_log` si falla el enlace),
 * invalidando toda la caché relacionada antes de emitir el toast de éxito.
 */
export function useStartRepairWorkOrder() {
  const { user } = useAuth();

  return useEntityMutation<DamageRecordWithJoins, string | null>({
    retry: false,
    mutationFn: async (record: DamageRecordWithJoins) => {
      const { data, error } = await supabase.rpc("start_repair_work_order", {
        p_damage_id: record.id,
        p_service_type: "Reparación de Daño",
        p_description: record.description,
        p_estimated_cost: record.estimated_cost ?? 0,
      });
      if (!error) {
        return typeof data === "string" ? data : null;
      }
      if (!isMissingRpcError(error)) {
        throw error;
      }

      const { data: createdLog, error: createError } = await supabase
        .from("maintenance_logs")
        .insert({
          forklift_id: record.forklift_id,
          service_type: "Reparación de Daño",
          description: record.description,
          manual_cost: 0,
          performed_by: user?.email ?? null,
        })
        .select("id")
        .single();
      if (createError) throw createError;

      const { error: updateError } = await supabase
        .from("damage_records")
        .update({ status: "in_repair", maintenance_log_id: createdLog.id })
        .eq("id", record.id)
        .select("id")
        .single();
      if (updateError) {
        try {
          await supabase.rpc("soft_delete_maintenance_log", { p_log_id: createdLog.id });
        } catch {
          // Best-effort compensation when damage_records update fails.
        }
        throw updateError;
      }
      return createdLog.id;
    },
    invalidateKeys: [...damageInvalidationKeys],
    successMsg: "Orden de mantenimiento creada",
    errorTitle: "No se pudo crear la orden de reparación",
  });
}
