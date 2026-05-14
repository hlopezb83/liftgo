import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

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
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (settings: {
      id?: string;
      rfc: string;
      razon_social: string;
      regimen_fiscal: string;
      lugar_expedicion: string;
      logo_url?: string | null;
      facturapi_mode?: string | null;
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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["company_settings"] }),
  });
}

/**
 * Llaves Facturapi: tabla aparte (billing_secrets) accesible solo a admin/administrativo.
 * Si el usuario no tiene permiso, la query devolver� null por RLS.
 */
export function useBillingSecrets() {
  return useQuery({
    queryKey: ["billing_secrets"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("billing_secrets")
        .select("id, facturapi_test_key, facturapi_live_key")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useUpsertBillingSecrets() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id?: string;
      facturapi_test_key?: string | null;
      facturapi_live_key?: string | null;
    }) => {
      const payload = {
        facturapi_test_key: input.facturapi_test_key || null,
        facturapi_live_key: input.facturapi_live_key || null,
        updated_at: new Date().toISOString(),
      };
      if (input.id) {
        const { data, error } = await supabase
          .from("billing_secrets")
          .update(payload)
          .eq("id", input.id)
          .select()
          .single();
        if (error) throw error;
        return data;
      }
      const { data, error } = await supabase
        .from("billing_secrets")
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["billing_secrets"] }),
  });
}
