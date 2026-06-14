import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { AppRole } from "@/lib/domain/roles";

// Re-export para compatibilidad con consumidores existentes. La fuente de
// verdad del tipo vive en `@/lib/domain/roles`.
export type { AppRole };


// Priority order when a user has multiple roles: highest privilege wins.
const ROLE_PRIORITY: AppRole[] = [
  "admin",
  "administrativo",
  "auditor",
  "ventas",
  "dispatcher",
  "mechanic",
  "customer",
];

export function useUserRole() {
  const { user } = useAuth();
  const userId = user?.id;

  return useQuery<AppRole | null>({
    queryKey: ["user_role", userId],
    enabled: !!userId,
    // Roles cambian con muy baja frecuencia. Cachear 5min reduce ~18k calls/día
    // a `user_roles`. Errores transitorios se recuperan vía retry: 2.
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    retry: 2,
    queryFn: async () => {
      if (!userId) return null;
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId);

      // Propagate errors instead of silently demoting the user to "dispatcher".
      // React Query will retry, and the UI will treat role as undefined until resolved.
      if (error) throw error;

      const roles = (data ?? []).map((r) => r.role as AppRole);
      if (roles.length === 0) return null;
      return ROLE_PRIORITY.find((p) => roles.includes(p)) ?? roles[0];
    },
  });
}
