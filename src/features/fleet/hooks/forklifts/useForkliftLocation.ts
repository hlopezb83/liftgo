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
      const { data: contract } = await supabase
        .from("contracts")
        .select("usage_location")
        .eq("forklift_id", forkliftId)
        .in("status", ["active", "signed"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (contract?.usage_location) return contract.usage_location;

      const { data: delivery } = await supabase
        .from("deliveries")
        .select("address")
        .eq("forklift_id", forkliftId)
        .eq("status", "completed")
        .order("completed_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return delivery?.address ?? null;
    },
  },
);

export function useForkliftLocation(forkliftId: string | undefined) {
  return useQuery(forkliftLocationQueries.detail(forkliftId ?? ""));
}
