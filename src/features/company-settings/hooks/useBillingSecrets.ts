import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEntityMutation } from "@/lib/hooks/useEntityMutation";
import { billingSecretsQueries, type BillingSecretsStatus } from "../lib/queryKeys";

export type { BillingSecretsStatus };

export function useBillingSecrets() {
  return useQuery(billingSecretsQueries.list());
}

export function useUpsertBillingSecrets() {
  return useEntityMutation({
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
      // Bloque 6.1: la columna SELECT sólo está permitida para (id, created_at, updated_at).
      // Por eso el .select() explícito evita pedir columnas sensibles (facturapi_*_key).
      const returning = "id, updated_at";
      if (input.id) {
        const { data, error } = await supabase
          .from("billing_secrets")
          .update(payload)
          .eq("id", input.id)
          .select(returning)
          .single();
        if (error) throw error;
        return data;
      }
      const { data, error } = await supabase
        .from("billing_secrets")
        .insert(payload)
        .select(returning)
        .single();
      if (error) throw error;
      return data;
    },
    invalidateKeys: [billingSecretsQueries.keys.all],
    errorTitle: "Error al guardar las llaves de facturación",
  });
}
