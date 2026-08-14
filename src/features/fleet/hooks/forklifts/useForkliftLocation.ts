import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { defineEntityQueries } from "@/lib/query/defineEntityQueries";

/**
 * Resolves the current location of a forklift:
 * 1. From an active/signed contract's usage_location.
 * 2. Falls back to the latest completed delivery address.
 */
export const forkliftLocationQueries = defineEntityQueries<"forklift-location", never, string | null>(
  "forklift-location",
  {
    list: () => () => {
      throw new Error("forklift-location: usar detail(forkliftId)");
    },
    detail: (forkliftId: string) => async () => {
      // 10.8: propagar el error en vez de degradar a `null` — indistinguible
      // de "sin ubicación" para quien consume el hook.
      const { data: contract, error: contractError } = await supabase
        .from("contracts")
        .select("usage_location")
        .eq("forklift_id", forkliftId)
        .in("status", ["active", "signed"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (contractError) throw contractError;
      if (contract?.usage_location) return contract.usage_location;

      const { data: delivery, error: deliveryError } = await supabase
        .from("deliveries")
        .select("address")
        .eq("forklift_id", forkliftId)
        .eq("status", "completed")
        .order("completed_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (deliveryError) throw deliveryError;
      return delivery?.address ?? null;
    },
  },
);

export function useForkliftLocation(forkliftId: string | undefined) {
  return useQuery(forkliftLocationQueries.detail(forkliftId ?? ""));
}
