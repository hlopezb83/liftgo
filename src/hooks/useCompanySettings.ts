import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useCompanySettings() {
  return useQuery({
    queryKey: ["company_settings"],
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
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (settings: {
      id?: string;
      rfc: string;
      razon_social: string;
      regimen_fiscal: string;
      lugar_expedicion: string;
      logo_url?: string | null;
    }) => {
      if (settings.id) {
        const { data, error } = await supabase
          .from("company_settings")
          .update(settings)
          .eq("id", settings.id)
          .select()
          .single();
        if (error) throw error;
        return data;
      } else {
        const { data, error } = await supabase
          .from("company_settings")
          .insert(settings)
          .select()
          .single();
        if (error) throw error;
        return data;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["company_settings"] }),
  });
}
