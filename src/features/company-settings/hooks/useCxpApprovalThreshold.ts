import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

import { useEntityMutation } from "@/lib/hooks/useEntityMutation";

export function useCxpApprovalThreshold() {
  return useQuery({
    queryKey: ["cxp_approval_threshold"],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<{ id: string | null; threshold: number }> => {
      const { data, error } = await supabase
        .from("company_settings")
        .select("id, cxp_approval_threshold_mxn")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return {
        id: data?.id ?? null,
        threshold: Number(data?.cxp_approval_threshold_mxn ?? 10000),
      };
    },
  });
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
    invalidateKeys: [["cxp_approval_threshold"], ["company_settings"]],
    successMsg: "Umbral de aprobación actualizado",
    errorTitle: "No se pudo actualizar el umbral",
  });
}

