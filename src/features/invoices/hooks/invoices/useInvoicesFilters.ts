import { isValid, parseISO } from "date-fns";
import { useCallback, useMemo } from "react";
import { useLocation } from "react-router";
import { useNavigateTransition } from "@/hooks/useNavigateTransition";
import { toYMD } from "@/lib/date/toYMD";
import {
  createInvoiceListFilters,
  createInvoiceListFilterKey,
  normalizeInvoiceCfdiFilter,
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
  const location = useLocation();
  const navigate = useNavigateTransition();
  const searchParams = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const search = normalizeInvoiceSearch(searchParams.get("q"));
  const statusFilter = normalizeInvoiceStatusFilter(searchParams.get("status"));
  const cfdiFilter = normalizeInvoiceCfdiFilter(searchParams.get("cfdi"));
  const fromParam = normalizeInvoiceDateParam(searchParams.get("from"));
  const toParam = normalizeInvoiceDateParam(searchParams.get("to"));

  const replaceParams = useCallback(
    (mutate: (params: URLSearchParams) => void) => {
      const next = new URLSearchParams(location.search);
      mutate(next);
      const nextSearch = next.toString();
      navigate(
        { pathname: location.pathname, search: nextSearch ? `?${nextSearch}` : "" },
        { replace: true },
      );
    },
    [location.pathname, location.search, navigate],
  );

  const setSearch = useCallback(
    (value: string) => {
      replaceParams((next) => {
        const normalized = normalizeInvoiceSearch(value);
        if (normalized) next.set("q", normalized);
        else next.delete("q");
      });
    },
    [replaceParams],
  );

  const setStatusFilter = useCallback(
    (value: string) => {
      replaceParams((next) => {
        const normalized = normalizeInvoiceStatusFilter(value);
        if (normalized === "all") next.delete("status");
        else next.set("status", normalized);
      });
    },
    [replaceParams],
  );

  const setCfdiFilter = useCallback(
    (value: string) => {
      replaceParams((next) => {
        const normalized = normalizeInvoiceCfdiFilter(value);
        if (normalized === "all") next.delete("cfdi");
        else next.set("cfdi", normalized);
      });
    },
    [replaceParams],
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
      replaceParams((next) => {
        const from = range?.from ? toYMD(range.from) : undefined;
        const to = range?.to ? toYMD(range.to) : undefined;
        if (from) next.set("from", from);
        else next.delete("from");
        if (to) next.set("to", to);
        else next.delete("to");
      });
    },
    [replaceParams],
  );

  const queryFilters = useMemo(
    () => createInvoiceListFilters({ search, status: statusFilter, cfdi: cfdiFilter, from: fromParam, to: toParam }),
    [search, statusFilter, cfdiFilter, fromParam, toParam],
  );

  const filterKey = useMemo(
    () => createInvoiceListFilterKey(queryFilters),
    [queryFilters],
  );

  const hasActive =
    !!search || statusFilter !== "all" || cfdiFilter !== "all" || !!fromParam || !!toParam;

  const clearAll = useCallback(() => {
    replaceParams((next) => {
      next.delete("q");
      next.delete("status");
      next.delete("cfdi");
      next.delete("from");
      next.delete("to");
    });
  }, [replaceParams]);

  return {
    search,
    setSearch,
    statusFilter,
    setStatusFilter,
    cfdiFilter,
    setCfdiFilter,
    dateRange,
    setDateRange,
    queryFilters,
    filterKey,
    hasActive,
    clearAll,
  };
}

