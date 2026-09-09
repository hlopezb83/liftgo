import { useQuery } from "@tanstack/react-query";
import type { Tables } from "@/integrations/supabase/types";
import { callRpc } from "@/lib/rpc";
import { forkliftKeys } from "../../lib/queryKeys";

type Forklift = Tables<"forklifts">;

const SALE_CANDIDATE_PAGE_SIZE = 200;

/**
 * Read every sale candidate from the database-side source of truth. Paging
 * keeps the result complete even when the API has a maximum response size;
 * the sale transition trigger still protects the later write from races.
 */
export async function fetchSaleAvailableForklifts(): Promise<Forklift[]> {
  const byId = new Map<string, Forklift>();
  let offset = 0;

  for (;;) {
    const page = await callRpc<Forklift[]>("get_sale_available_forklifts", {
      p_limit: SALE_CANDIDATE_PAGE_SIZE,
      p_offset: offset,
    });

    for (const forklift of page) byId.set(forklift.id, forklift);
    if (page.length < SALE_CANDIDATE_PAGE_SIZE) break;
    offset += SALE_CANDIDATE_PAGE_SIZE;
  }

  return [...byId.values()];
}

export function useSaleAvailableForklifts() {
  return useQuery({
    queryKey: forkliftKeys.saleAvailable(),
    queryFn: fetchSaleAvailableForklifts,
    staleTime: 30_000,
  });
}
