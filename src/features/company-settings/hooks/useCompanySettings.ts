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
 * Estado de llaves Facturapi: solo indica si están configuradas, nunca devuelve los valores.
 * Las llaves reales solo viven en el servidor (Edge Functions con service role).
 */
export interface BillingSecretsStatus {
  id: string | null;
  has_test_key: boolean;
  has_live_key: boolean;
}

export function useBillingSecrets() {
  return useQuery<BillingSecretsStatus | null>({
    queryKey: ["billing_secrets_status"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_billing_secrets_status");
      if (error) throw error;
      const row = Array.isArray(data) && data.length > 0 ? data[0] : null;
      if (!row) return { id: null, has_test_key: false, has_live_key: false };
      return {
        id: row.id ?? null,
        has_test_key: !!row.has_test_key,
        has_live_key: !!row.has_live_key,
      };
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
      // Solo se incluyen las llaves que el usuario realmente capturó (no vacías),
      // para no sobrescribir el valor existente con null cuando solo se rota una.
      const payload: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };
      if (input.facturapi_test_key && input.facturapi_test_key.length > 0) {
        payload.facturapi_test_key = input.facturapi_test_key;
      }
      if (input.facturapi_live_key && input.facturapi_live_key.length > 0) {
        payload.facturapi_live_key = input.facturapi_live_key;
      }
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
