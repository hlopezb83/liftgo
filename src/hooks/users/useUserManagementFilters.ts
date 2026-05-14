import { useMemo, useState } from "react";
import type { UserRow } from "@/hooks/useUserManagement";

export function useUserManagementFilters(users: UserRow[] | undefined) {
  const [search, setSearch] = useState("");
  const [filterRole, setFilterRole] = useState<string>("all");

  const filtered = useMemo(() => (users ?? []).filter((u) => {
    const q = search.toLowerCase();
    const matchesSearch = !search ||
      (u.full_name ?? "").toLowerCase().includes(q) ||
      (u.email ?? "").toLowerCase().includes(q);
    const matchesRole = filterRole === "all" || u.role === filterRole;
    return matchesSearch && matchesRole;
  }), [users, search, filterRole]);

  return { search, setSearch, filterRole, setFilterRole, filtered };
}
