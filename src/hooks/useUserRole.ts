import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import type { Database } from "@/integrations/supabase/types";

export type AppRole = Database["public"]["Enums"]["app_role"];

export function useUserRole() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["user_role", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user!.id);
      if (error || !data || data.length === 0) return "dispatcher" as AppRole;
      // Priority: admin > customer > mechanic > dispatcher
      const priority: AppRole[] = ["admin", "customer", "administrativo", "auditor", "ventas", "mechanic", "dispatcher"];
      const roles = data.map((r) => r.role as AppRole);
      return priority.find((p) => roles.includes(p)) ?? "dispatcher";
    },
  });
}
