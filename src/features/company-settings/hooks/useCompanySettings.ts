import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEntityMutation } from "@/lib/hooks/useEntityMutation";
import { companySettingsQueries } from "../lib/queryKeys";

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
    invalidateKeys: [companySettingsQueries.keys.all],
    errorTitle: "Error al guardar datos fiscales",
  });
}
