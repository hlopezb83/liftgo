import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { Database } from "@/integrations/supabase/types";

export type AppRole = Database["public"]["Enums"]["app_role"];

export function useUserRole() {
  const { user } = useAuth();

  const userId = user?.id;
  return useQuery({
    queryKey: ["user_role", userId],
    enabled: !!userId,
    queryFn: async () => {
      if (!userId) return "dispatcher" as AppRole;
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId);
      if (error || !data || data.length === 0) return "dispatcher" as AppRole;
      // Priority: admin > customer > mechanic > dispatcher
      const priority: AppRole[] = ["admin", "customer", "administrativo", "auditor", "ventas", "mechanic", "dispatcher"];
      const roles = data.map((r) => r.role as AppRole);
      return priority.find((p) => roles.includes(p)) ?? "dispatcher";
    },
  });
}
