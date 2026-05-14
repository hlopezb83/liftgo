import { useMemo, useState } from "react";
import { format } from "date-fns";
import {
  EXPENSE_CATEGORY_LABELS, type ExpenseCategory, type OperatingExpense,
} from "@/features/expenses/hooks/useOperatingExpenses";

const CATEGORIES = Object.entries(EXPENSE_CATEGORY_LABELS) as [ExpenseCategory, string][];

export function useExpenseFilters(expenses: OperatingExpense[] | undefined) {
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterMonth, setFilterMonth] = useState<string>(format(new Date(), "yyyy-MM"));
  const [search, setSearch] = useState("");

  const availableMonths = useMemo(() => {
    const set = new Set<string>();
    (expenses || []).forEach((e) => set.add(e.expense_date.slice(0, 7)));
    set.add(format(new Date(), "yyyy-MM"));
    return Array.from(set).sort().reverse();
  }, [expenses]);

  const availableCategories = useMemo(() => {
    const set = new Set<ExpenseCategory>();
    (expenses || []).forEach((e) => set.add(e.category));
    return CATEGORIES.filter(([v]) => set.has(v));
  }, [expenses]);

  const filtered = useMemo(() => {
    return (expenses || []).filter((e) => {
      if (filterCategory !== "all" && e.category !== filterCategory) return false;
      if (filterMonth !== "all" && !e.expense_date.startsWith(filterMonth)) return false;
      if (search && !(e.description || "").toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [expenses, filterCategory, filterMonth, search]);

  const total = useMemo(() => filtered.reduce((sum, e) => sum + e.amount, 0), [filtered]);

  return {
    filterCategory, setFilterCategory,
    filterMonth, setFilterMonth,
    search, setSearch,
    availableMonths, availableCategories,
    filtered, total,
  };
}
