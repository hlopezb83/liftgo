import { useCallback, useMemo, useState } from "react";
import { format } from "date-fns";
import {
  EXPENSE_CATEGORY_LABELS, type ExpenseCategory, type OperatingExpense,
} from "@/features/expenses/hooks/useOperatingExpenses";

const CATEGORIES = Object.entries(EXPENSE_CATEGORY_LABELS) as [ExpenseCategory, string][];

export function useExpenseFilters(expenses: OperatingExpense[] | undefined) {
  const currentMonth = format(new Date(), "yyyy-MM");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterMonth, setFilterMonth] = useState<string>("all");
  const [search, setSearch] = useState("");

  const availableMonths = useMemo(() => {
    const set = new Set<string>();
    (expenses || []).forEach((e) => set.add(e.expense_date.slice(0, 7)));
    set.add(currentMonth);
    return Array.from(set).sort().reverse();
  }, [expenses, currentMonth]);

  const availableCategories = useMemo(() => {
    const set = new Set<ExpenseCategory>();
    (expenses || []).forEach((e) => set.add(e.category));
    return CATEGORIES.filter(([v]) => set.has(v));
  }, [expenses]);

  const matchesFilters = useCallback((e: OperatingExpense) => {
    if (filterCategory !== "all" && e.category !== filterCategory) return false;
    if (filterMonth !== "all" && !e.expense_date.startsWith(filterMonth)) return false;
    const q = search.trim().toLowerCase();
    if (q) {
      const haystack = `${e.description || ""} ${e.suppliers?.name || ""}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  }, [filterCategory, filterMonth, search]);

  const filtered = useMemo(
    () => (expenses || []).filter(matchesFilters),
    [expenses, matchesFilters],
  );

  const total = useMemo(() => filtered.reduce((sum, e) => sum + e.amount, 0), [filtered]);

  const hasActiveFilters =
    filterCategory !== "all" || filterMonth !== "all" || search.trim() !== "";

  const resetFilters = useCallback(() => {
    setFilterCategory("all");
    setFilterMonth("all");
    setSearch("");
  }, []);

  return {
    filterCategory, setFilterCategory,
    filterMonth, setFilterMonth,
    search, setSearch,
    availableMonths, availableCategories,
    filtered, total,
    matchesFilters, resetFilters, hasActiveFilters,
  };
}
