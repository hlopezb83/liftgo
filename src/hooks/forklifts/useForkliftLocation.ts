import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Resolves the current location of a forklift:
 * 1. From an active/signed contract's usage_location.
 * 2. Falls back to the latest completed delivery address.
 */
export function useForkliftLocation(forkliftId: string | undefined) {
  return useQuery({
    queryKey: ["forklift-location", forkliftId],
    enabled: !!forkliftId,
    queryFn: async () => {
      if (!forkliftId) return null;
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
  });
}
