import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEntityMutation } from "@/lib/hooks/useEntityMutation";
import { cxpApprovalThresholdQueries, companySettingsQueries } from "../lib/queryKeys";

export function useCxpApprovalThreshold() {
  return useQuery(cxpApprovalThresholdQueries.list());
}

export function useUpdateCxpApprovalThreshold() {
  return useEntityMutation({
    mutationFn: async ({ id, threshold }: { id: string | null; threshold: number }) => {
      if (!id) {
        throw new Error(
          "Primero captura los Datos Fiscales para crear la configuración base de la empresa.",
        );
      }
      const { error } = await supabase
        .from("company_settings")
        .update({ cxp_approval_threshold_mxn: threshold })
        .eq("id", id);
      if (error) throw error;
    },
    invalidateKeys: [cxpApprovalThresholdQueries.keys.all, companySettingsQueries.keys.all],
    successMsg: "Umbral de aprobación actualizado",
    errorTitle: "No se pudo actualizar el umbral",
  });
}
