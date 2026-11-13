import { useEffect } from "react";
import { useTableFilters } from "@/hooks/filters/useTableFilters";
import { useTableViewState } from "@/hooks/filters/useTableViewState";
import { useNavigateTransition } from "@/hooks/useNavigateTransition";
import { BOOKING_STATUSES } from "@/lib/constants";
import { useLocation } from "@/lib/router-compat";
import { useBookingPage, type BookingPageRow } from "./useBookingPage";

type Booking = BookingPageRow;
const FACETS = {
  q: { type: "text" as const, fields: ["customer_name", "booking_number"] as (keyof Booking)[] },
  status: { type: "enum" as const, field: "status" as const, options: ["all", ...BOOKING_STATUSES] },
  view: { type: "enum" as const, options: ["all", "upcoming"] },
};

export function useBookingListView() {
  const filters = useTableFilters<Booking, typeof FACETS>({ mode: "server", facets: FACETS });
  const { q, status: requestedStatus, view } = filters.values;
  const upcoming = view === "upcoming";
  const incompatibleStatus = upcoming && requestedStatus !== "all" && requestedStatus !== "confirmed";
  const status = incompatibleStatus ? "all" : requestedStatus;
  const { set } = filters;
  // Also repair older bookmarks before they can request contradictory statuses.
  useEffect(() => {
    if (incompatibleStatus) set("status", "all");
  }, [incompatibleStatus, set]);
  const viewState = useTableViewState(undefined, [{ id: "start_date", desc: !upcoming }]);
  const { controlledPagination: pagination, controlledSorting: sorting, onControlledPaginationChange } = viewState;
  const query = useBookingPage({ q, status, upcoming, ...pagination, sorting });
  useEffect(() => {
    if (!query.isError && query.data && query.data.pageIndex !== pagination.pageIndex) {
      onControlledPaginationChange({ ...pagination, pageIndex: query.data.pageIndex });
    }
  }, [query.data, query.isError, pagination, onControlledPaginationChange]);
  const filtered = query.data?.items ?? [];
  const location = useLocation();
  const navigate = useNavigateTransition();
  const setView = (value: string) => {
    const next = new URLSearchParams(location.search);
    if (value === "upcoming") {
      next.set("view", value);
      if (requestedStatus !== "all" && requestedStatus !== "confirmed") next.delete("status");
    }
    else next.delete("view");
    next.delete("tablePage");
    next.delete("tableSort");
    navigate({ pathname: location.pathname, search: next.toString() ? `?${next}` : "" }, { replace: true });
  };
  return { ...filters, values: { ...filters.values, status }, filtered, query, upcoming, setView, viewState };
}
