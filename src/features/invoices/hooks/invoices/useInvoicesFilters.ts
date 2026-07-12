// React Compiler memoiza automáticamente las derivaciones puras de este hook.
import { parseISO, isWithinInterval, startOfDay, endOfDay } from "date-fns";
import { useSearchParams } from "react-router";
import { useListFilters } from "@/hooks/useListFilters";
import { toYMD } from "@/lib/date/toYMD";
import type { Invoice } from "@/types/rental";

/**
 * Encapsulates the Invoices page filtering logic:
 * - Search + status (delegated to useListFilters)
 * - Special "overdue" pseudo-status (sent/partial past due_date)
 * - Date range filter on issued_at, persisted in URL (?from=&to=)
 */
export function useInvoicesFilters(invoices: Invoice[] | undefined) {
  const { search, setSearch, statusFilter, setStatusFilter, filtered: baseFiltered } = useListFilters(invoices, {
    searchFields: ["invoice_number", "customer_name"],
    statusField: "status",
  });

  const computeStatusFiltered = () => {
    if (statusFilter !== "overdue") return baseFiltered;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const q = search.toLowerCase();
    return (invoices || []).filter((inv) => {
      if (!inv.due_date) return false;
      if (!["sent", "partial"].includes(inv.status)) return false;
      if (parseISO(inv.due_date) >= today) return false;
      if (search) {
        return [inv.invoice_number, inv.customer_name || ""].some((v) => v.toLowerCase().includes(q));
      }
      return true;
    });
  };
  const statusFiltered = computeStatusFiltered();

  const [searchParams, setSearchParams] = useSearchParams();
  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");

  const dateRange = (fromParam || toParam)
    ? {
        from: fromParam ? parseISO(fromParam) : undefined,
        to: toParam ? parseISO(toParam) : undefined,
      }
    : undefined;

  const setDateRange = (range?: { from?: Date; to?: Date }) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (range?.from) next.set("from", toYMD(range.from) ?? "");
        else next.delete("from");
        if (range?.to) next.set("to", toYMD(range.to) ?? "");

        else next.delete("to");
        return next;
      },
      { replace: true },
    );
  };

  const computeFiltered = () => {
    if (!statusFiltered) return statusFiltered;
    if (!dateRange?.from && !dateRange?.to) return statusFiltered;
    const start = dateRange.from ? startOfDay(dateRange.from) : new Date(-8640000000000000);
    const end = dateRange.to ? endOfDay(dateRange.to) : new Date(8640000000000000);
    return statusFiltered.filter((inv) => {
      if (!inv.issued_at) return false;
      return isWithinInterval(parseISO(inv.issued_at), { start, end });
    });
  };
  const filtered = computeFiltered();

  return {
    search,
    setSearch,
    statusFilter,
    setStatusFilter,
    dateRange,
    setDateRange,
    filtered,
  };
}
