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
      // R-arq DIFF 4: única vía admin para escribir. La RPC valida rol,
      // ignora strings vacíos (COALESCE + NULLIF) y no devuelve valores
      // sensibles. Eliminado el UPDATE/INSERT directo contra billing_secrets.
      const { data, error } = await supabase.rpc("upsert_billing_secret", {
        p_id: input.id ?? null,
        p_test_key: input.facturapi_test_key ?? null,
        p_live_key: input.facturapi_live_key ?? null,
      });
      if (error) throw error;
      return { id: data as string };
    },
    invalidateKeys: [billingSecretsQueries.keys.all],
    errorTitle: "Error al guardar las llaves de facturación",
  });
}
