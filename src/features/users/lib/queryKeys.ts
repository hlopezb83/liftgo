import { createEntityKeys } from "@/lib/query/createEntityKeys";
import { defineEntityQueries } from "@/lib/query/defineEntityQueries";
import { supabase } from "@/integrations/supabase/client";
import type { AppRole } from "../hooks/useUserRole";

export interface UserRow {
  user_id: string;
  full_name: string | null;
  email: string | null;
  created_at: string;
  role: AppRole;
  is_active: boolean;
}

export interface UsersFilter extends Record<string, unknown> {
  role?: AppRole;
  isActive?: boolean;
}

export const userKeys = createEntityKeys("users");

async function fetchUsers(filter?: Readonly<UsersFilter>): Promise<UserRow[]> {
  // Paralelizar — antes era secuencial (~2x latencia innecesaria).
  const [profilesRes, rolesRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("user_id, full_name, email, is_active, created_at")
      .order("created_at", { ascending: false }),
    supabase.from("user_roles").select("user_id, role"),
  ]);
  if (profilesRes.error) throw profilesRes.error;
  if (rolesRes.error) throw rolesRes.error;
  const profiles = profilesRes.data ?? [];
  const roles = rolesRes.data ?? [];

  const roleMap = new Map(roles.map((r) => [r.user_id, r.role as AppRole]));
  let rows: UserRow[] = profiles.map((p) => ({
    user_id: p.user_id,
    full_name: p.full_name,
    email: p.email ?? null,
    created_at: p.created_at,
    role: roleMap.get(p.user_id) ?? ("dispatcher" as AppRole),
    is_active: p.is_active ?? true,
  }));

  if (filter?.role) {
    rows = rows.filter((r) => r.role === filter.role);
  }
  if (typeof filter?.isActive === "boolean") {
    rows = rows.filter((r) => r.is_active === filter.isActive);
  }

  return rows;
}

export const userQueries = defineEntityQueries<"users", UserRow[]>("users", {
  list: (filter) => async () => fetchUsers(filter as UsersFilter | undefined),
  staleTime: 5 * 60_000,
});
