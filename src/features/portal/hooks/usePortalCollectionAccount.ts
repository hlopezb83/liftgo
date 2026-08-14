import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { portalQueries, type PortalCollectionAccount } from "../lib/queryKeys";

export type { PortalCollectionAccount };

export function usePortalCollectionAccount() {
  const { user } = useAuth();
  return useQuery({
    ...portalQueries.collectionAccount.list(),
    // Mismo gateo que usePortalQuotes: no disparar el RPC antes de sesión.
    enabled: !!user,
  });
}
