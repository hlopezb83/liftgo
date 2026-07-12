import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEntityMutation } from "@/lib/hooks/useEntityMutation";
import { cashFlowSettingsQueries, type CashFlowSettings } from "../lib/queryKeys";

export type { CashFlowSettings };
export const CASH_FLOW_SETTINGS_QK = cashFlowSettingsQueries.keys.lists();

export function useCashFlowSettings() {
  return useQuery(cashFlowSettingsQueries.list());
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
    invalidateKeys: [cashFlowSettingsQueries.keys.all, ["company_settings"]],
    successMsg: "Preferencias de flujo de caja actualizadas",
    errorTitle: "No se pudieron actualizar las preferencias de flujo de caja",
  });
}
