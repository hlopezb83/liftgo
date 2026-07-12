import { useQuery } from "@tanstack/react-query";
import { portalQueries, type PortalCollectionAccount } from "../lib/queryKeys";

export type { PortalCollectionAccount };

export function usePortalCollectionAccount() {
  return useQuery(portalQueries.collectionAccount.list());
}
