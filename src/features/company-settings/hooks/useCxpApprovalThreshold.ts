import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

import { notifyError, notifySuccess } from "@/lib/ui/appFeedback";

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
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, threshold }: { id: string | null; threshold: number }) => {
      if (id) {
        const { error } = await supabase
          .from("company_settings")
          .update({ cxp_approval_threshold_mxn: threshold })
          .eq("id", id);
        if (error) throw error;
        return;
      }
      // No row exists yet — block until base settings created via Datos Fiscales.
      throw new Error(
        "Primero captura los Datos Fiscales para crear la configuración base de la empresa.",
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cxp_approval_threshold"] });
      qc.invalidateQueries({ queryKey: ["company_settings"] });
      notifySuccess("Umbral de aprobación actualizado");
    },
    onError: (e: Error) => notifyError({ error: e, message: e.message }),
  });
}
