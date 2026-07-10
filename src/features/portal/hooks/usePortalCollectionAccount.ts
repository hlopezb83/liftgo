import { useQuery } from "@tanstack/react-query";
import { callRpc } from "@/lib/rpc";

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
      const data = await callRpc<PortalCollectionAccount[] | null>("get_portal_collection_account");
      return (data ?? [])[0] ?? null;
    },
  });
}
