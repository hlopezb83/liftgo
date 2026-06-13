import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { AppRole } from "../useUserRole";

export interface UserRow {
  user_id: string;
  full_name: string | null;
  email: string | null;
  created_at: string;
  role: AppRole;
  is_active: boolean;
}

export const USERS_QUERY_KEY = ["users_with_roles"];

export function useUsersWithRoles() {
  return useQuery({
    queryKey: USERS_QUERY_KEY,
    queryFn: async () => {
      const { data: profiles, error: pErr } = await supabase
        .from("profiles")
        .select("user_id, full_name, email, is_active, created_at")
        .order("created_at", { ascending: false });
      if (pErr) throw pErr;

      const { data: roles, error: rErr } = await supabase
        .from("user_roles")
        .select("user_id, role");
      if (rErr) throw rErr;

      const roleMap = new Map(roles.map((r) => [r.user_id, r.role as AppRole]));
      return (profiles ?? []).map((p) => ({
        user_id: p.user_id,
        full_name: p.full_name,
        email: p.email ?? null,
        created_at: p.created_at,
        role: roleMap.get(p.user_id) ?? ("dispatcher" as AppRole),
        is_active: p.is_active ?? true,
      })) as UserRow[];
    },
  });
}
