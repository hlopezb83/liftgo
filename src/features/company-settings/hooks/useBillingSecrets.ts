import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { callRpc } from "@/lib/rpc";

/**
 * Estado de llaves Facturapi: solo indica si están configuradas, nunca devuelve los valores.
 * Las llaves reales solo viven en el servidor (Edge Functions con service role).
 */
export interface BillingSecretsStatus {
  id: string | null;
  has_test_key: boolean;
  has_live_key: boolean;
}

type BillingSecretsRow = { id: string | null; has_test_key: boolean | null; has_live_key: boolean | null };

export function useBillingSecrets() {
  return useQuery<BillingSecretsStatus | null>({
    queryKey: ["billing_secrets_status"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const data = await callRpc<BillingSecretsRow[] | null>("get_billing_secrets_status");
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
      const payload: {
        updated_at: string;
        facturapi_test_key?: string;
        facturapi_live_key?: string;
      } = {
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
