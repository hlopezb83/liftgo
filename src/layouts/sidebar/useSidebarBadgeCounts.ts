import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { SidebarBadgeKey } from "./navConfig";

// Oleada 1: UN solo RPC compartido entre todos los NavMenuItem con badge.
// staleTime alto y sin refetchInterval → 1 request por sesión salvo invalidación.
export function useSidebarBadgeCounts() {
  return useQuery({
    queryKey: ["sidebar-badge-counts"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_sidebar_badge_counts");
      if (error) throw error;
      return (data ?? {}) as Partial<Record<SidebarBadgeKey, number>>;
    },
    staleTime: 60_000,
  });
}
