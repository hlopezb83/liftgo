import { useMemo, useState } from "react";
import type { UserRow } from "./useUserManagement";

export function useUserManagementFilters(users: UserRow[] | undefined) {
  const [search, setSearch] = useState("");
  const [filterRole, setFilterRole] = useState<string>("all");

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return (users ?? []).filter((u) => {
      const matchesSearch = !search ||
        (u.full_name ?? "").toLowerCase().includes(q) ||
        (u.email ?? "").toLowerCase().includes(q);
      const matchesRole = filterRole === "all" || u.role === filterRole;
      return matchesSearch && matchesRole;
    });
  }, [users, search, filterRole]);

  return { search, setSearch, filterRole, setFilterRole, filtered };
}
