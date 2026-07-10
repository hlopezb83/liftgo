import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEntityMutation } from "@/lib/hooks/useEntityMutation";

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
  return useEntityMutation<
    { id: string | null; initialBalance: number; safetyBuffer: number },
    void
  >({
    mutationFn: async (input) => {
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
    invalidateKeys: [CASH_FLOW_SETTINGS_QK, ["company_settings"]],
    successMsg: "Preferencias de flujo de caja actualizadas",
    errorTitle: "No se pudieron actualizar las preferencias de flujo de caja",
  });
}
