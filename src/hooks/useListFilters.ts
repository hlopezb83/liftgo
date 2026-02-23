import { useState, useMemo } from "react";

interface UseListFiltersOptions<T> {
  searchFields: (keyof T)[];
  statusField?: keyof T;
}

export function useListFilters<T extends Record<string, any>>(
  items: T[] | undefined,
  options: UseListFiltersOptions<T>
) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const filtered = useMemo(() => {
    return items?.filter((item) => {
      // Status filter
      if (options.statusField && statusFilter !== "all") {
        if (item[options.statusField] !== statusFilter) return false;
      }
      // Search filter
      if (search) {
        const q = search.toLowerCase();
        return options.searchFields.some((field) => {
          const val = item[field];
          return typeof val === "string" && val.toLowerCase().includes(q);
        });
      }
      return true;
    });
  }, [items, search, statusFilter, options.searchFields, options.statusField]);

  return { search, setSearch, statusFilter, setStatusFilter, filtered };
}
