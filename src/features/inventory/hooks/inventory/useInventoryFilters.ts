import { useState } from "react";
import type { PartInventory } from "../usePartsInventory";

/**
 * Encapsulates Inventory page filtering: search by name/SKU, category filter,
 * and the derived `lowStockCount` KPI.
 */
export function useInventoryFilters(parts: PartInventory[] | undefined) {
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("all");

  const filtered = (parts || []).filter((p) => {
    if (filterCategory !== "all" && p.category !== filterCategory) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      if (!p.name.toLowerCase().includes(q) && !(p.sku || "").toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const lowStockCount = (parts || []).filter((p) => p.stock_quantity <= p.min_stock_level).length;

  const hasActive = search.trim().length > 0 || filterCategory !== "all";
  const reset = () => { setSearch(""); setFilterCategory("all"); };
  return { search, setSearch, filterCategory, setFilterCategory, filtered, lowStockCount, hasActive, reset };
}
