import { useMemo } from "react";
import { COMPANY_SETTINGS_INVALIDATION_KEYS, useCompanySettings } from "@/features/company-settings";
import { supabase } from "@/integrations/supabase/client";
import { useEntityMutation } from "@/lib/hooks/useEntityMutation";
import type { CashFlowSettings } from "../lib/queryKeys";

export type { CashFlowSettings };

/**
 * Tanda 3 P3-10.1: derivamos de `useCompanySettings()` en vez de mantener
 * una query paralela contra la misma fila singleton de `company_settings`.
 */
export function useCashFlowSettings() {
  const q = useCompanySettings();
  const data: CashFlowSettings | undefined = useMemo(() => {
    if (!q.data) return q.isSuccess ? { id: null, initialBalance: 0, safetyBuffer: 0 } : undefined;
    return {
      id: q.data.id ?? null,
      initialBalance: Number(q.data.cash_initial_balance ?? 0),
      safetyBuffer: Number(q.data.cash_safety_buffer ?? 0),
    };
  }, [q.data, q.isSuccess]);
  return { ...q, data } as typeof q & { data: CashFlowSettings | undefined };
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
    invalidateKeys: COMPANY_SETTINGS_INVALIDATION_KEYS,
    successMsg: "Preferencias de flujo de caja actualizadas",
    errorTitle: "No se pudieron actualizar las preferencias de flujo de caja",
  });
}
