import { useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useEntityMutation } from "@/lib/hooks/useEntityMutation";
import { COMPANY_SETTINGS_INVALIDATION_KEYS } from "../lib/queryKeys";
import { useCompanySettings } from "./useCompanySettings";

/**
 * A6R2-7: el buffer de días alrededor del próximo servicio estaba hardcodeado
 * en las RPC de reservas (create_booking, extend_booking,
 * get_available_forklifts). Ahora vive en `company_settings` y se lee aquí
 * derivando del singleton, sin abrir otra query.
 */

export const DEFAULT_MAINTENANCE_BUFFER_DAYS = 3;

export interface MaintenanceBufferSetting {
  id: string | null;
  days: number;
}

export function useMaintenanceBuffer() {
  const q = useCompanySettings();
  const data: MaintenanceBufferSetting | undefined = useMemo(() => {
    if (!q.data) {
      return q.isSuccess ? { id: null, days: DEFAULT_MAINTENANCE_BUFFER_DAYS } : undefined;
    }
    return {
      id: q.data.id ?? null,
      days: Number(q.data.maintenance_buffer_days ?? DEFAULT_MAINTENANCE_BUFFER_DAYS),
    };
  }, [q.data, q.isSuccess]);
  return { ...q, data } as typeof q & { data: MaintenanceBufferSetting | undefined };
}

export function useUpdateMaintenanceBuffer() {
  return useEntityMutation({
    mutationFn: async ({ id, days }: { id: string | null; days: number }) => {
      if (!id) {
        throw new Error(
          "Primero captura los Datos Fiscales para crear la configuración base de la empresa.",
        );
      }
      if (!Number.isInteger(days) || days < 0 || days > 30) {
        throw new Error("El buffer debe ser un número entero entre 0 y 30 días.");
      }
      const { error } = await supabase
        .from("company_settings")
        .update({ maintenance_buffer_days: days })
        .eq("id", id);
      if (error) throw error;
    },
    invalidateKeys: COMPANY_SETTINGS_INVALIDATION_KEYS,
    successMsg: "Buffer de mantenimiento actualizado",
    errorTitle: "No se pudo actualizar el buffer",
  });
}
