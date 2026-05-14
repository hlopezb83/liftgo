import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { parseISO, isWithinInterval, startOfDay, endOfDay } from "date-fns";
import { useListFilters } from "@/hooks/useListFilters";
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

  const statusFiltered = useMemo(() => {
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
  }, [invoices, baseFiltered, statusFilter, search]);

  const [searchParams, setSearchParams] = useSearchParams();
  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");

  const dateRange = useMemo(() => {
    if (!fromParam && !toParam) return undefined;
    return {
      from: fromParam ? parseISO(fromParam) : undefined,
      to: toParam ? parseISO(toParam) : undefined,
    };
  }, [fromParam, toParam]);

  const setDateRange = (range?: { from?: Date; to?: Date }) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (range?.from) next.set("from", range.from.toISOString().slice(0, 10));
        else next.delete("from");
        if (range?.to) next.set("to", range.to.toISOString().slice(0, 10));
        else next.delete("to");
        return next;
      },
      { replace: true },
    );
  };

  const filtered = useMemo(() => {
    if (!statusFiltered) return statusFiltered;
    if (!dateRange?.from && !dateRange?.to) return statusFiltered;
    const start = dateRange.from ? startOfDay(dateRange.from) : new Date(-8640000000000000);
    const end = dateRange.to ? endOfDay(dateRange.to) : new Date(8640000000000000);
    return statusFiltered.filter((inv) => {
      if (!inv.issued_at) return false;
      return isWithinInterval(parseISO(inv.issued_at), { start, end });
    });
  }, [statusFiltered, dateRange]);

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
