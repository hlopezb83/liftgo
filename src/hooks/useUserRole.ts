import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export type AppRole = "admin" | "dispatcher" | "mechanic" | "customer";

export function useUserRole() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["user_role", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user!.id)
        .single();
      if (error) return "dispatcher" as AppRole; // default
      return data.role as AppRole;
    },
  });
}
