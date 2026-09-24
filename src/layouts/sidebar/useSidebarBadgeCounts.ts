import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useVerifiedOrganizationId } from "@/contexts/OrganizationContext";
import { useUserRole } from "@/features/users";
import { supabase } from "@/integrations/supabase/client";
import type { SidebarBadgeKey } from "./navConfig";

// El RPC excluye al auditor y al cliente del portal de métricas internas.
const BADGE_ROLES = new Set(["admin", "administrativo", "dispatcher", "ventas", "mechanic"]);

// Oleada 1: UN solo RPC compartido entre todos los NavMenuItem con badge.
// staleTime alto y sin refetchInterval → 1 request por sesión salvo invalidación.
export function useSidebarBadgeCounts() {
  const { user } = useAuth();
  const organizationId = useVerifiedOrganizationId();
  const { data: role } = useUserRole();

  return useQuery({
    queryKey: ["sidebar-badge-counts", user?.id, organizationId],
    enabled: !!user && !!organizationId && !!role && BADGE_ROLES.has(role),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_sidebar_badge_counts");
      if (error) throw error;
      return (data ?? {}) as Partial<Record<SidebarBadgeKey, number>>;
    },
    staleTime: 60_000,
  });
}
