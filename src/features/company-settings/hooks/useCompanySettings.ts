import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEntityMutation } from "@/lib/hooks/useEntityMutation";

export function useCompanySettings() {
  return useQuery({
    queryKey: ["company_settings"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_settings")
        .select("*")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
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
    invalidateKeys: [["company_settings"]],
    errorTitle: "Error al guardar datos fiscales",
  });
}
