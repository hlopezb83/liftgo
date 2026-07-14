import { useCallback, useMemo } from "react";
import { isValid, parseISO } from "date-fns";
import { useSearchParams } from "react-router";
import { toYMD } from "@/lib/date/toYMD";
import {
  createInvoiceListFilters,
  normalizeInvoiceDateParam,
  normalizeInvoiceSearch,
  normalizeInvoiceStatusFilter,
} from "../../lib/invoiceListFilters";

/**
 * Encapsulates the Invoices page filtering logic:
 * - Search + status in URL params
 * - Special "overdue" pseudo-status (sent/partial past due_date)
 * - Date range filter on issued_at, persisted in URL (?from=&to=)
 * - Query filters consumed by useInvoices so filtering happens before limit()
 */
export function useInvoicesFilters() {
  const [searchParams, setSearchParams] = useSearchParams();
  const search = normalizeInvoiceSearch(searchParams.get("q"));
  const statusFilter = normalizeInvoiceStatusFilter(searchParams.get("status"));
  const fromParam = normalizeInvoiceDateParam(searchParams.get("from"));
  const toParam = normalizeInvoiceDateParam(searchParams.get("to"));

  const setSearch = useCallback(
    (value: string) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          const normalized = normalizeInvoiceSearch(value);
          if (normalized) next.set("q", normalized);
          else next.delete("q");
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const setStatusFilter = useCallback(
    (value: string) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          const normalized = normalizeInvoiceStatusFilter(value);
          if (normalized === "all") next.delete("status");
          else next.set("status", normalized);
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const dateRange = useMemo(
    () => {
      if (!fromParam && !toParam) return undefined;
      const from = fromParam ? parseISO(fromParam) : undefined;
      const to = toParam ? parseISO(toParam) : undefined;
      return {
        from: from && isValid(from) ? from : undefined,
        to: to && isValid(to) ? to : undefined,
      };
    },
    [fromParam, toParam],
  );

  const setDateRange = useCallback(
    (range?: { from?: Date; to?: Date }) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (range?.from) next.set("from", toYMD(range.from));
          else next.delete("from");
          if (range?.to) next.set("to", toYMD(range.to));
          else next.delete("to");
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const queryFilters = useMemo(
    () => createInvoiceListFilters({ search, status: statusFilter, from: fromParam, to: toParam }),
    [search, statusFilter, fromParam, toParam],
  );

  return {
    search,
    setSearch,
    statusFilter,
    setStatusFilter,
    dateRange,
    setDateRange,
    queryFilters,
  };
}
