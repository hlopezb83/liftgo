import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface PortalCollectionAccount {
  bank: string | null;
  clabe: string | null;
  account_number: string | null;
  account_holder: string | null;
  currency: string | null;
}

export function usePortalCollectionAccount() {
  return useQuery({
    queryKey: ["portal_collection_account"],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<PortalCollectionAccount | null> => {
      const { data, error } = await supabase.rpc("get_portal_collection_account");
      if (error) throw error;
      const row = (data ?? [])[0];
      return row ?? null;
    },
  });
}
