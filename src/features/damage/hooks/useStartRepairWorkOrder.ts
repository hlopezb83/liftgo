import { supabase } from "@/integrations/supabase/client";
import type { DamageRecordWithJoins } from "@/types/rental";

/**
 * GUI-FE-06d (G-MEC-03): intenta el RPC atómico `start_repair_work_order`
 * (GUI-DB-09: INSERT maintenance_log + UPDATE damage_record en una sola
 * transacción, SECURITY DEFINER → también funciona para mechanic, G-MEC-02).
 * Devuelve `false` si la función aún no existe en este entorno para que el
 * caller use el flujo legado; lanza cualquier otro error real.
 */
export async function tryStartRepairWorkOrderRpc(
  record: DamageRecordWithJoins,
): Promise<boolean> {
  const { error } = await supabase.rpc("start_repair_work_order", {
    p_damage_id: record.id,
    p_service_type: "Reparación de Daño",
    p_description: record.description,
    p_estimated_cost: record.estimated_cost ?? 0,
  });
  if (!error) return true;
  const missingRpc =
    error.code === "PGRST202" ||
    error.code === "42883" ||
    /schema cache|could not find the function/i.test(error.message ?? "");
  if (missingRpc) return false;
  throw error;
}

/**
 * Hook que expone el helper RPC. No mantiene estado propio porque la
 * operación es una llamada directa a backend; el caller maneja invalidación
 * de cache y notificaciones.
 */
export function useStartRepairWorkOrder() {
  return { tryStartRepairWorkOrder: tryStartRepairWorkOrderRpc };
}
