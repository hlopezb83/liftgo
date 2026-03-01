import { useState, useMemo } from "react";

type SortDirection = "asc" | "desc";

interface UseSortOptions<T> {
  defaultKey?: string;
  defaultDirection?: SortDirection;
  accessors?: Record<string, (item: T) => any>;
}

export function useSort<T>(
  items: T[] | undefined,
  options: UseSortOptions<T> = {}
) {
  const [sortKey, setSortKey] = useState<string | null>(options.defaultKey ?? null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(options.defaultDirection ?? "asc");

  const toggleSort = (key: string) => {
    if (sortKey === key) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDirection("asc");
    }
  };

  const sortedItems = useMemo(() => {
    if (!items || !sortKey) return items;

    const accessor = options.accessors?.[sortKey];
    const getValue = accessor ?? ((item: T) => (item as any)[sortKey]);

    return [...items].sort((a, b) => {
      const valA = getValue(a);
      const valB = getValue(b);

      if (valA == null && valB == null) return 0;
      if (valA == null) return 1;
      if (valB == null) return -1;

      let cmp = 0;
      if (typeof valA === "number" && typeof valB === "number") {
        cmp = valA - valB;
      } else {
        cmp = String(valA).localeCompare(String(valB), undefined, {
          sensitivity: "base",
          numeric: true,
        });
      }

      return sortDirection === "asc" ? cmp : -cmp;
    });
  }, [items, sortKey, sortDirection, options.accessors]);

  return { sortKey, sortDirection, toggleSort, sortedItems };
}
