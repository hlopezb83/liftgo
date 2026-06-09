import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { notifyError } from "@/lib/ui/appFeedback";

export interface CashFlowSettings {
  id: string | null;
  initialBalance: number;
  safetyBuffer: number;
}

export const CASH_FLOW_SETTINGS_QK = ["cash_flow_settings"] as const;

export function useCashFlowSettings() {
  return useQuery({
    queryKey: CASH_FLOW_SETTINGS_QK,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<CashFlowSettings> => {
      const { data, error } = await supabase
        .from("company_settings")
        .select("id, cash_initial_balance, cash_safety_buffer")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return {
        id: data?.id ?? null,
        initialBalance: Number(data?.cash_initial_balance ?? 0),
        safetyBuffer: Number(data?.cash_safety_buffer ?? 0),
      };
    },
  });
}

export function useUpdateCashFlowSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      input: { id: string | null; initialBalance: number; safetyBuffer: number },
    ) => {
      if (!input.id) {
        throw new Error(
          "Primero captura los Datos Fiscales para crear la configuración base de la empresa.",
        );
      }
      const { error } = await supabase
        .from("company_settings")
        .update({
          cash_initial_balance: input.initialBalance,
          cash_safety_buffer: input.safetyBuffer,
        })
        .eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CASH_FLOW_SETTINGS_QK });
      qc.invalidateQueries({ queryKey: ["company_settings"] });
      toast.success("Preferencias de flujo de caja actualizadas");
    },
    onError: (e: Error) => notifyError({ error: e, message: e.message }),
  });
}
