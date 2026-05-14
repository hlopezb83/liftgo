import { useMemo, useState } from "react";
import type { PartInventory } from "@/features/inventory/hooks/usePartsInventory";

/**
 * Encapsulates Inventory page filtering: search by name/SKU, category filter,
 * and the derived `lowStockCount` KPI.
 */
export function useInventoryFilters(parts: PartInventory[] | undefined) {
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("all");

  const filtered = useMemo(() => {
    return (parts || []).filter((p) => {
      if (filterCategory !== "all" && p.category !== filterCategory) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!p.name.toLowerCase().includes(q) && !(p.sku || "").toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [parts, filterCategory, search]);

  const lowStockCount = useMemo(
    () => (parts || []).filter((p) => p.stock_quantity <= p.min_stock_level).length,
    [parts],
  );

  return { search, setSearch, filterCategory, setFilterCategory, filtered, lowStockCount };
}
