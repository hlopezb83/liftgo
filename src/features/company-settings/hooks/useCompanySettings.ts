import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEntityMutation } from "@/lib/hooks/useEntityMutation";
import { COMPANY_SETTINGS_INVALIDATION_KEYS, companySettingsQueries } from "../lib/queryKeys";

export function useCompanySettings() {
  return useQuery(companySettingsQueries.list());
}

export function useUpsertCompanySettings() {
  return useEntityMutation({
    mutationFn: async (settings: {
      id?: string;
      rfc: string;
      razon_social: string;
      regimen_fiscal: string;
      lugar_expedicion: string;
      logo_url?: string | null;
      facturapi_mode?: string | null;
    }) => {
      const query = settings.id
        ? supabase.from("company_settings").update(settings).eq("id", settings.id)
        : supabase.from("company_settings").insert(settings);
      const { data, error } = await query.select().single();
      if (error) throw error;
      return data;
    },
    // Ola v7.207.0 (DIFF 9c/d): la fila de company_settings alimenta 3 caches
    // (companySettings, cxpApprovalThreshold, cashFlowSettings). Invalidamos
    // todas para que la UI refleje datos frescos tras cualquier upsert.
    invalidateKeys: COMPANY_SETTINGS_INVALIDATION_KEYS,
    errorTitle: "Error al guardar datos fiscales",
  });
}
